import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { encodeWorkbook } from '../v1/web/shared/workbooks.mjs';
import { productSuite, origin } from './v1-product/suite.mjs';
const suite = await productSuite({bindings:{HOSTED_DOMAIN:'example.invalid'}});
let browser;
try {
  const admin = await suite.seedAccount('layout-ui-admin');
  const source = {schemaVersion:1,repository:'layout-current',year:2026,revision:'source-1',state:'source-import',sourceDeployVersion:null,sources:[],issues:[],venues:[{id:'room-a',unitNumber:'A1-01',geometryUnit:'A1-01',name:'Classroom',shortName:'1A',block:'A',floor:1,capacity:40,active:'Y'}],classes:[{id:'class-a',code:'1A',name:'1A',shortName:'A',level:1,active:'Y'}],groups:[{id:'tg-a',code:'MTL1',level:1,levels:[1],subject:'MTL',teacherLabels:'Synthetic Teacher',pupilCount:12,pupilCountText:'',programmes:'Initial',notes:'',active:'Y'}],allocations:[{id:'alloc-a',kind:'teaching_group',targetId:'tg-a',targetLabel:'MTL1',unitNumber:'A1-01',active:'Y'}],pupilBreakdown:[]};
  await suite.call(admin,'layout','/snapshot/import',{operationId:'layout-ui-source',year:2026,revision:0,snapshot:source});
  browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||undefined});
  const context = await browser.newContext({acceptDownloads:true});
  await context.addCookies([{name:'__Host-gsis_session',value:admin.token,domain:'gsis.example.invalid',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
  const calls=[], external=[];
  let loseApplyResponse=false, stopBeforeApply=false;
  await context.route('**/*', async route => {
    const req=route.request();
    if(req.url()==='https://accounts.google.com/gsi/client')return route.fulfill({status:200,contentType:'application/javascript',body:''});
    if(!req.url().startsWith(origin+'/')){external.push(req.url());return route.abort();}
    if(req.url().includes('/api/layout/'))calls.push({url:req.url(),body:req.postDataJSON()});
    if(stopBeforeApply&&req.url().endsWith('/api/layout/import-apply')){stopBeforeApply=false;return route.abort();}
    const result=await suite.mf.dispatchFetch(req.url(),{method:req.method(),headers:await req.allHeaders(),body:['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer()});
    if(loseApplyResponse&&req.url().endsWith('/api/layout/import-apply')){loseApplyResponse=false;return route.abort();}
    const headers=Object.fromEntries(result.headers);delete headers['transfer-encoding'];
    return route.fulfill({status:result.status,headers,body:Buffer.from(await result.arrayBuffer())});
  });
  const page=await context.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const panel=page.locator('details.gsis-panel').filter({has:page.locator('[data-rows]')}).first();
  const modal=panel.locator('dialog.gsis-import-preview');
  async function openOwned(){await page.locator('#tgTab').click();await panel.locator('table[data-layout-owned] thead').waitFor();await panel.locator('.gsis-core-import').waitFor({state:'visible'});}
  const owned=async()=>(await suite.request(admin,'layout','/owned-data?year=2026')).body.data;
  const workbook=async()=>(await suite.request(admin,'layout','/export?year=2026')).body.data;
  const upload=async(book)=>panel.locator('[data-import]').setInputFiles({name:'layout.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await encodeWorkbook(book,{Zip:JSZip}))});
  await page.goto(origin+'/layout/');await openOwned();
  assert.equal(await panel.locator('.gsis-core-tools').count(),1);
  assert.equal(await panel.getByRole('button',{name:'Export All',exact:true}).count(),0);
  await panel.locator('[aria-label="Excel export scope"]').selectOption('all');
  const pendingDownload=page.waitForEvent('download');await panel.getByRole('button',{name:'Export Excel',exact:true}).click();
  const downloaded=await pendingDownload;
  assert.equal(downloaded.suggestedFilename(),'GSiS-Layout-2026.xlsx');
  const zip=await JSZip.loadAsync(await readFile(await downloaded.path()));
  assert((await zip.file('xl/workbook.xml').async('string')).includes('pupilBreakdown'));
  await panel.locator('.gsis-core-import').click();
  const original=await workbook(), bad=structuredClone(original), pupil=bad.sheets.groups.columns.indexOf('Pupils');
  bad.sheets.groups.rows[0][pupil]=-1;
  await upload(bad);
  await modal.locator('[aria-invalid="true"]').waitFor();
  assert.equal(await modal.locator('[data-import-confirm]').isDisabled(),true);
  assert.equal((await owned()).revision,1);
  assert(!calls.some(call=>call.url.endsWith('/import-apply')),'invalid workbook never applies');
  const corrected=structuredClone(original);corrected.sheets.groups.rows[0][pupil]=17;
  await upload(corrected);
  await page.waitForFunction(()=>!document.querySelector('[data-import-confirm]').disabled);
  assert.equal(await panel.locator('dialog[open]').count(),1,'corrected file stays in the same modal');
  assert.equal(await modal.locator('[aria-invalid="true"]').count(),0);
  assert(!calls.some(call=>call.url.endsWith('/import-apply')),'server preview needs explicit confirmation');
  await modal.locator('[data-import-confirm]').click();
  await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('revision 2'));
  assert.equal((await owned()).rows.groups[0].pupilCount,17);
  // A successful server commit with a lost response must recover by its original
  // receipt after a true browser reload, without a second apply operation.
  const next=await workbook();next.sheets.groups.rows[0][pupil]=19;
  await panel.locator('.gsis-core-import').click();await upload(next);
  await page.waitForFunction(()=>!document.querySelector('[data-import-confirm]').disabled);
  loseApplyResponse=true;await modal.locator('[data-import-confirm]').click();
  await modal.locator('[data-import-status]').filter({hasText:'original operation is retained'}).waitFor();
  const applyCalls=calls.filter(call=>call.url.endsWith('/import-apply'));
  assert.equal(applyCalls.length,2);
  const retained=await page.evaluate(()=>Object.entries(sessionStorage).find(([key])=>key.startsWith('gsis-layout-import:')));
  assert(retained[0].includes('synthetic-school:layout-ui-admin'));
  assert.deepEqual(JSON.parse(retained[1]),applyCalls[1].body);
  await page.reload();await openOwned();await panel.locator('.gsis-core-import').click();
  assert.equal(await modal.locator('[data-import]').isDisabled(),true);
  await modal.locator('[data-import-receipt]').click();
  await modal.locator('[data-import-status]').filter({hasText:'original Layout import committed'}).waitFor();
  assert.equal(calls.filter(call=>call.url.endsWith('/import-apply')).length,2,'receipt recovery does not create or repeat an apply');
  assert.equal((await owned()).revision,3);
  assert.equal((await owned()).rows.groups[0].pupilCount,19);
  assert.equal(await modal.locator('[data-import]').isDisabled(),false);
  const retryBook=await workbook();retryBook.sheets.groups.rows[0][pupil]=21;
  await upload(retryBook);await page.waitForFunction(()=>!document.querySelector('[data-import-confirm]').disabled);
  stopBeforeApply=true;await modal.locator('[data-import-confirm]').click();
  await modal.locator('[data-import-status]').filter({hasText:'original operation is retained'}).waitFor();
  assert.equal((await owned()).revision,3,'request lost before dispatch changes nothing');
  await modal.getByRole('button',{name:'Retry original Layout import',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('revision 4'));
  const retries=calls.filter(call=>call.url.endsWith('/import-apply')).slice(-2);
  assert.deepEqual(retries[0].body,retries[1].body,'unknown retry preserves exact operation and preview binding');
  assert.equal((await owned()).rows.groups[0].pupilCount,21);
  await page.evaluate(()=>dispatchEvent(new Event('gsis:clear-protected-state')));
  assert.equal(await panel.isVisible(),false);
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith('gsis-layout-import:'))),false);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS Layout Core toolbar, canonical XLSX, rejected cell highlights, corrected-file modal, explicit atomic apply and lost-response receipt recovery across browser reload; synthetic Workers/D1/browser only');
} finally {await browser?.close();await suite.close();}
