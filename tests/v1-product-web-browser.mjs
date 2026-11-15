import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from 'playwright';
import JSZip from 'jszip';
import {encodeWorkbook} from '../v1/web/shared/workbooks.mjs';
import {productSuite,origin} from './v1-product/suite.mjs';

// Actual nine Worker services, isolated D1/R2 and the copied browser sources.
// External requests are blocked. These fixtures are not runtime UAT or live data.
const evidence=process.env.GSIS_WEB_EVIDENCE_DIR||fileURLToPath(new URL('../deliverables/v1/evidence/browser/',import.meta.url));
await mkdir(evidence,{recursive:true});
const suite=await productSuite({bindings:{GOOGLE_CLIENT_ID:'synthetic-browser.apps.googleusercontent.com',HOSTED_DOMAIN:'example.invalid'}});
let browser;
try{
 const admin=await suite.seedAccount('browser-admin');
 await suite.call(admin,'contacts','/staff/create',{operationId:'browser-create-teacher',staffId:'browser-teacher',basicName:'Synthetic Teacher'});
 const source={schemaVersion:1,repository:'layout-current',year:2026,revision:'source-1',state:'source-import',sourceDeployVersion:null,sources:[],issues:[],venues:[{id:'room-a',unitNumber:'A1-01',geometryUnit:'A1-01',name:'Classroom',shortName:'1A',block:'A',floor:1,capacity:40,active:'Y'}],classes:[{id:'class-a',code:'1A',name:'1A',shortName:'A',level:1,active:'Y'}],groups:[{id:'tg-a',code:'MTL1',level:1,levels:[1],subject:'MTL',teacherLabels:'Synthetic Teacher',pupilCount:12,pupilCountText:'',programmes:'Initial',notes:'',active:'Y'}],allocations:[{id:'alloc-a',kind:'teaching_group',targetId:'tg-a',targetLabel:'MTL1',unitNumber:'A1-01',active:'Y'}],pupilBreakdown:[]};
 await suite.call(admin,'layout','/snapshot/import',{operationId:'browser-layout-source',year:2026,revision:0,snapshot:source});
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||undefined});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),egress=[];
 await context.addCookies([{name:'__Host-gsis_session',value:admin.token,domain:'gsis.example.invalid',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
 await context.route('**/*',async route=>{const request=route.request();if(!request.url().startsWith(origin+'/')){egress.push(request.url());await route.abort();return;}const result=await suite.mf.dispatchFetch(request.url(),{method:request.method(),headers:await request.allHeaders(),body:['GET','HEAD'].includes(request.method())?undefined:request.postDataBuffer()});const headers=Object.fromEntries(result.headers);delete headers['transfer-encoding'];await route.fulfill({status:result.status,headers,body:Buffer.from(await result.arrayBuffer())});});
 const modules=[['contacts','Contacts are ready'],['deploy','Create initial baseline'],['roster','Baseline Timetable'],['calendar','Year Setup'],['layout','3D Campus'],['venues','Book a venue'],['lord','Book Devices'],['overlord','Open loans'],['starlord','No active or upcoming bookings']];
 const results=[];
 for(let start=0;start<modules.length;start+=3)await Promise.all(modules.slice(start,start+3).map(async([module,text])=>{const page=await context.newPage(),errors=[],failedAssets=[];page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().startsWith(origin+'/')&&!response.url().includes('/api/')&&response.status()>=400)failedAssets.push(response.url());});await page.goto(origin+'/'+module+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(value=>document.body.innerText.includes(value),text,{timeout:12000});assert.equal(new URL(page.url()).pathname,'/'+module+'/');assert.deepEqual(errors,[],module+' runtime errors');assert.deepEqual(failedAssets,[],module+' broken assets');assert.equal(await page.locator('.gsis-suitebar[aria-label=Breadcrumb]').count(),1,module+' compact breadcrumbs');await page.waitForFunction(()=>!document.querySelector('body > details.gsis-panel'));assert.equal(await page.locator('body > details.gsis-panel').count(),0,module+' has no detached appended panel');await page.screenshot({path:join(evidence,module+'-desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(evidence,module+'-narrow.png')});results.push({module,initialScreen:'passed',pageErrors:errors,brokenAssets:failedAssets});await page.close();}));
 assert(!egress.some(url=>/script\.google(?:usercontent)?\.com/.test(url)),'No Apps Script runtime request is permitted');
 const page=await context.newPage();await page.goto(origin+'/contacts/');await page.locator('.navbar [data-page=admin]').click();const authority=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Accepted authority records'})}).first();await authority.locator('[data-staff]').waitFor({state:'visible'});await authority.locator('[data-staff]').selectOption('browser-teacher');await authority.locator('[data-field]').selectOption('eo');await authority.locator('[data-value]').selectOption('true');await authority.locator('[data-accept] button').click();await page.waitForFunction(()=>document.querySelector('[data-records]')?.innerText.includes('Yes'));const accepted=await suite.request(admin,'contacts','/staff/browser-teacher');assert.equal(accepted.body.data.fields.eo.value,true);assert.equal(accepted.body.data.fields.eo.state,'accepted');
 await page.goto(origin+'/deploy/');page.once('dialog',dialog=>dialog.accept('Synthetic planning version'));await page.getByRole('button',{name:'Create initial baseline',exact:true}).click();await page.waitForFunction(()=>Boolean(document.querySelector('#version')?.value),null,{timeout:12000});const versions=await suite.request(admin,'deploy','/versions');assert(versions.body.data.versions?.length>0||versions.body.data.rows?.length>0,'The existing create control commits a real version');
 // Populate the new planning version through its real owner contract for visual evidence.
 const versionId=await page.locator('#version').inputValue(),lease=await suite.call(admin,'deploy','/lease',{operationId:'browser-grid-lease',versionId,revision:0,scope:'meta',clientId:'browser-grid'});const grid=await suite.call(admin,'deploy','/change',{operationId:'browser-grid-fixture',versionId,revision:0,scope:'meta',clientId:'browser-grid',leaseFence:lease.fence,operation:'saveDraft',edits:[{operation:'addClass',ref:'browser-class-a',level:'1',name:'A',shortName:'A',expected:null},{operation:'addClass',ref:'browser-class-b',level:'1',name:'B',shortName:'B',expected:null},{operation:'setLoad',level:'1',subject:'EL',value:10,expected:0},{operation:'setLoad',level:'1',subject:'Math',value:8,expected:0},{operation:'addTG',localId:'browser-tg-el',level:'1',levels:['1'],name:'EL Support',subject:'EL',classRefs:['browser-class-a','browser-class-b'],levelWide:false,weeklyPeriods:6,venue:''}]});assert.equal(grid.saved,true);await page.reload();await page.waitForFunction(()=>document.querySelector('#content')?.innerText.includes('EL Support'));await page.screenshot({path:join(evidence,'deploy-populated-ip-tg-desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(evidence,'deploy-populated-ip-tg-narrow.png')});await page.setViewportSize({width:1440,height:1000});
 await page.goto(origin+'/layout/');await page.locator('#tgTab').click();const layout=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Layout-owned data'})}).first();await layout.getByLabel('tg-a programmes',{exact:true}).waitFor({state:'visible'});await layout.getByLabel('tg-a programmes',{exact:true}).fill('Browser verified programme');await layout.locator('[data-rows] tr').filter({has:page.getByLabel('tg-a programmes',{exact:true})}).getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-rows] input[aria-label="tg-a programmes"]')?.value==='Browser verified programme'&&document.querySelector('[data-status]')?.textContent.includes('revision 2'));const layoutBook=(await suite.request(admin,'layout','/export?year=2026')).body.data;const pupilColumn=layoutBook.sheets.groups.columns.indexOf('Pupils');assert(pupilColumn>=0);layoutBook.sheets.groups.rows[0][pupilColumn]=17;await layout.locator('[data-import]').setInputFiles({name:'layout-reviewed.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await encodeWorkbook(layoutBook,{Zip:JSZip}))});await layout.getByRole('button',{name:'Confirm Layout import',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-status]')?.textContent.includes('revision 3'));const owned=(await suite.request(admin,'layout','/owned-data?year=2026')).body.data;assert.equal(owned.rows.groups[0].programmes,'Browser verified programme');assert.equal(owned.rows.groups[0].pupilCount,17);await layout.scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'layout-after-owned-edit-and-import.png')});
 // New controls live inside the owning native screens and survive their redraws.
 await page.goto(origin+'/roster/');await page.locator('#content [data-page="System Config"]').click();
 await page.locator('#content details.gsis-panel').filter({hasText:'Continuity exports and offline return'}).waitFor({state:'visible'});
 assert.equal(await page.locator('#content details.gsis-panel').filter({has:page.locator('[data-layer-list]')}).count(),1);
 await page.locator('.gsis-suitebar').getByRole('link',{name:'Roster',exact:true}).click({trial:true});
 await page.screenshot({path:join(evidence,'roster-system-config.png')});
 await page.locator('.gsis-suitebar').getByRole('link',{name:'Roster',exact:true}).click();
 await page.locator('#content [data-page="System Config"]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-gsis-panel-parking] [data-layer-list]').isVisible(),false);
 await page.goto(origin+'/overlord/');await page.locator('#systemSettingsBtn').click();
 await page.locator('#settingsBody [data-reference-tables]').waitFor({state:'visible'});
 await page.locator('#settingsBody details').filter({hasText:'Signage access'}).waitFor({state:'visible'});
 await page.screenshot({path:join(evidence,'overlord-native-settings.png')});
 await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.locator('#systemSettingsBtn').click();
 await page.locator('#settingsBody details').filter({hasText:'Signage access'}).waitFor({state:'visible'});
 assert.equal(await page.locator('#settingsBody details').filter({hasText:'Signage access'}).count(),1);
 await page.goto(origin+'/lord/');await page.locator('#manageBookingsBtn').click();
 await page.locator('#main .action-grid [data-lord-edit-bookings]').click();
 await page.locator('#gsisLordBookingEditor [data-lord-status]').filter({hasText:'no uncollected bookings'}).waitFor({state:'visible'});
 await page.locator('#gsisLordBookingEditor [data-lord-close]').click();
 await page.locator('#backBtn').click();await page.locator('#main .section-book [data-lord-edit-bookings]').waitFor({state:'visible'});
 // Contacts management remains reachable without Core Admin authority.
 const manager=await suite.seedAccount('browser-contacts-manager',{capabilities:['contacts.read','contacts.manage','contacts.accept']});
 await context.addCookies([{name:'__Host-gsis_session',value:manager.token,domain:'gsis.example.invalid',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
 await page.goto(origin+'/contacts/');await page.locator('.navbar [data-page=admin]').click();
 await page.locator('#admin [data-staff]').waitFor({state:'visible'});await page.locator('#admin [data-staff]').selectOption('browser-teacher');
 await page.locator('#admin [data-accept]').waitFor({state:'visible'});await page.locator('.navbar [data-page=data]').click();
 await page.locator('#data [data-person="browser-teacher"][aria-label="Role"]').waitFor({state:'visible'});
 await page.locator('#data [data-contacts-contributions] > summary').click();
 await page.locator('#data [data-load-contributions]').waitFor({state:'visible'});
 assert.equal(await page.locator('#data [data-contributions]').count(),1,'The contribution inbox belongs to the direct editor');
 assert.equal(await page.locator('script[src*="contacts-catalogues.js"]').count(),0,'The removed catalogue editor is not loaded');
 assert.equal(await page.getByText('Staff classifications and controlled catalogues',{exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>GSISV1.capable('core.admin')),false,'Contacts manager does not become Core Admin');
 const teacher=await suite.seedAccount('browser-readonly-teacher',{capabilities:['contacts.read']});
 await context.addCookies([{name:'__Host-gsis_session',value:teacher.token,domain:'gsis.example.invalid',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
 await page.goto(origin+'/contacts/');await page.locator('#app').waitFor({state:'visible'});
 assert.equal(await page.locator('.navbar [data-page=admin]').isVisible(),false);assert.equal(await page.locator('[data-accept]').isVisible(),false);
 assert.equal(await page.evaluate(()=>GSISV1.capable('contacts.manage')),false,'Teacher does not gain Contacts management');
 await context.addCookies([{name:'__Host-gsis_session',value:admin.token,domain:'gsis.example.invalid',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
 await page.goto(origin+'/');await page.locator('.module').last().waitFor({state:'visible'});await page.waitForFunction(()=>[...document.querySelectorAll('.module-icon img')].every(image=>image.complete&&image.naturalWidth>0));await page.screenshot({path:join(evidence,'home-desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(evidence,'home-narrow.png')});await page.evaluate(()=>localStorage.setItem('gsis-browser-draft','private'));await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForFunction(()=>document.body.innerText.includes('School sign-in'));assert.equal(await page.evaluate(()=>localStorage.getItem('gsis-browser-draft')),null);assert.equal((await suite.request(admin,'core','/session')).status,401,'Browser logout revokes the actual Core session');
 await writeFile(join(evidence,'results.json'),JSON.stringify({source:'actual isolated Workers and browser',results,verified:['nine initial screens','desktop and narrow screenshots','Contacts explicit EO acceptance','Contacts manager native sections without Core Admin; Teacher denial unchanged','Deploy initial version creation','Populated synthetic IP/TG grid screenshots','Layout owned edit and canonical XLSX preview/apply','Roster settings placement and breadcrumb return','OVERLORD settings/signage placement across reopen','LORD booking edit entry survives native rerender','Core logout and protected draft clearance'],externalRequestsBlocked:egress,officialRuntimeUAT:'Not tested'},null,2));
 console.log('PASS actual nine-Worker screens, Contacts acceptance, Deploy create/grid, Layout XLSX, Roster/OVERLORD/LORD native placement and redraws, logout/draft clearance. Evidence: '+evidence);
 await context.close();
}finally{await browser?.close();await suite.close();}
