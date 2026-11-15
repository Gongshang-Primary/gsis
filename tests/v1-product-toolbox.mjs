import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {productSuite, origin} from './v1-product/suite.mjs';
const suite=await productSuite();let browser;
try {
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||undefined});
 for(const [id,capabilities,allowed] of [['global',['admin'],true],['domain',['roster.admin'],false],['ordinary',[],false]]) {
  const account=await suite.seedAccount(id,{capabilities}),context=await browser.newContext();
  await context.addCookies([{name:'__Host-gsis_session',value:account.token,domain:'gsis.example.invalid',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
  await context.route('**/*',async route=>{
   const r=route.request();if(!r.url().startsWith(origin+'/'))return route.abort();
   const response=await suite.mf.dispatchFetch(r.url(),{method:r.method(),headers:await r.allHeaders(),body:['GET','HEAD'].includes(r.method())?undefined:r.postDataBuffer()});
   const headers=Object.fromEntries(response.headers);delete headers['transfer-encoding'];
   return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
  });
  const page=await context.newPage();await page.goto(origin+'/');
  await page.waitForFunction(n=>document.querySelectorAll('.module').length===n,allowed?10:9);
  assert.equal(await page.getByRole('link',{name:'Global Admin Toolbox Accounts, system health, backups and recovery.'}).count(),allowed?1:0);
  const response=await suite.request(account,'core','/admin/accounts');assert.equal(response.status,allowed?200:403,'direct server access cannot bypass the tile');
  await page.goto(origin+'/admin/#services');
  if(allowed){
   await page.locator('#services').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelector('.gsis-suitebar [aria-current=page]').textContent==='Scheduled service access');
   await page.getByRole('button',{name:'Decision evidence',exact:true}).click();
   assert.equal(new URL(page.url()).hash,'#evidence');
   await page.reload();await page.locator('#evidence').waitFor({state:'visible'});
  } else {
   await page.getByText('Global Admin Toolbox requires current Global Admin access.',{exact:true}).waitFor();
   assert.equal(await page.locator('#adminContent').isVisible(),false);
  }
  await context.close();
 }
 console.log('PASS real Core Global Admin tile/route versus domain Admin and ordinary user; Toolbox deep links and breadcrumbs survive reload');
}finally{await browser?.close();await suite.close();}
