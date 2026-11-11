import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fixture,publishDuties} from './helpers/relief-info-fixture.mjs';
import {edgeRosterBackend,mutateEdgeRoster} from '../roster-update/public/edge-roster.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const realNow=Date.now,realFetch=globalThis.fetch;Date.now=()=>Date.parse('2026-11-10T22:00:00Z');
globalThis.fetch=()=>assert.fail('No live Google/provider requests');
let f,browser;
try{
 f=await fixture(4,{date:'2026-11-11'});const cmd=await f.capture(0,{timetableId:'obsolete',parity:'odd',staplerRevision:0}),id=(await f.state()).absences[0].id;await publishDuties(f,[id]);
 await mutateEdgeRoster(f.env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'fixtureRetainedDraft'},needsContext:false,apply(state,ctx){state.edgeInstructionDrafts=[{id:cmd.requestId,actor:f.who(0).email,date:f.date,command:cmd,savedIds:[id],createdAt:ctx.iso,status:'needsReview',reasonCode:'INSTRUCTION_SOURCE_CHANGED'}];return {};}});
 browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
 await page.route('https://roster.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://roster.test/');
 let actor=3;
 await page.exposeFunction('__nativeApi',async(route,p)=>{const result=(await edgeRosterBackend(f.env,'rosterOperations',p,f.who(actor),crypto.randomUUID())).result;return result;});
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-acknowledgement-ui.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:readFileSync(file,'utf8')});
 for(const file of ['roster-update/public/roster.css','roster-update/public/roster-operations.css'])await page.addStyleTag({content:readFileSync(file,'utf8')});
 async function render(pageName,index){actor=index;await page.evaluate(async({pageName,index,date})=>{const user={email:'synthetic-'+index+'@gsps.edu.sg',staffId:'synthetic-'+index,smc:index===3,admin:index===3,accessVerified:true};window.testContext={profile:{user},today:()=>date,container:document.querySelector('#content'),status:()=>{},api:async(route,p)=>{const result=await window.__nativeApi(route,p);if(!result.ok)throw Object.assign(Error(result.error),{status:result.status,code:result.code});return result.data;}};window.testState=await RosterOpsUI.render(pageName,window.testContext);},{pageName,index,date:f.date});}
 await render('Absences by Date',3);await page.locator('[data-absence-instruction-info]').waitFor();assert.match(await page.locator('[data-absence-instruction-info]').textContent(),/Synthetic retained instruction 0/);assert(await page.locator('[data-note-match]').count());
 await page.waitForFunction(()=>window.testState.intakeEntries?.length===1);assert.equal(await page.evaluate(()=>testState.intakeEntries[0].intakeState),'applied');
 await page.locator('[data-absence-instruction-info] summary').first().click();assert(await page.locator('[data-note-match] .ops-text').first().isVisible());
 assert.equal(await page.locator('[data-retry-intake]').count(),0,'an instruction item has no retry task');assert.equal(await page.locator('[data-intake-attention]').count(),0,'retained instruction state is information, not Needs attention');
 await page.screenshot({path:'/tmp/info-only-smc-notes.png',fullPage:true});
 await render('My Relief Duties',2);await page.locator('[data-duty-today]').waitFor();assert.match(await page.locator('[data-duty-today]').textContent(),/Synthetic retained instruction 0/,'on-day duty shows its note');
 const snapshot=(await f.state()).publicationSnapshots.at(-1),ack=(await edgeRosterBackend(f.env,'rosterOperations',{operation:'acknowledge',date:f.date,requestId:crypto.randomUUID(),snapshotIds:[snapshot.id]},f.who(2),crypto.randomUUID())).result;assert.equal(ack.ok,true);
 await render('My Relief Duties',2);assert.match(await page.locator('[data-duty-today]').textContent(),/Synthetic retained instruction 0/,'acknowledgement does not hide duty information');
 assert.deepEqual(errors,[]);console.log('PASS Chromium: real SMC managed-absence notes/matches, no instruction retry or attention task, and on-day recipient duty notes before/after acknowledgement');
}finally{await browser?.close();f?.db.sql.close();Date.now=realNow;globalThis.fetch=realFetch;}
