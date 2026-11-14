import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {buildWeb} from '../scripts/v1/build-web.mjs';
await buildWeb();
const js=await readFile(new URL('../deliverables/v1/web/v1/shared/roster-capacity.js',import.meta.url),'utf8');
const native=await readFile(new URL('../deliverables/v1/web/roster/roster-operations-ui.js',import.meta.url),'utf8');
assert(native.includes('return window.GSISV1RosterCapacity.render(s,h)'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||undefined});
try {
 const page=await browser.newPage();await page.setContent('<main></main>');await page.addScriptTag({content:js});
 await page.evaluate(()=>{
   window.calls=[];
   window.GSISV1={request:async(...args)=>{window.calls.push(args);return {note:'Known demand only',observedAt:0,days:[{date:'2026-11-16',state:'projected',planned:1,unresolved:[{}],reserve:{periods:[{period:2,green:['bob']}]}}]};}};
   document.querySelector('main').innerHTML=window.GSISV1RosterCapacity.render({date:'2026-11-16',data:{people:[{id:'bob',name:'Bob <script>'},{id:'alice',name:'Alice'}]}},{observedAt:0,verified:true,note:'Choices share R',periods:[{period:2,start:'08:00',end:'08:30',green:['bob'],potentialStaffIds:['bob','alice']} ]});
 });
 assert.equal(await page.locator('.available').count(),1);assert.equal(await page.locator('.baseline').count(),1);
 assert.equal(await page.locator('main script').count(),0);
 await page.locator('summary').click();await page.locator('[data-capacity-forecast]').click();
 await page.getByText('Known demand only',{exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>window.calls))[0][2].body.operation,'capacityForecast');
 assert.equal(await page.locator('[data-capacity-result] tbody tr').count(),1);
 await page.evaluate(()=>window.GSISV1.request=async()=>{throw Error('FORECAST_CHANGED');});
 await page.locator('[data-capacity-forecast]').click();
 await page.getByText('Forecast not verified: FORECAST_CHANGED',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-capacity-result] table').count(),0,'stale successful output removed on failed refresh');
 console.log('PASS built renderer uses current green, faint baseline, escaped labels, bounded forecast route and stale-result failure');
} finally {await browser.close();}
