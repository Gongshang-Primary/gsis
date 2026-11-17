// Real native Roster UI, owner service and persisted D1; source projections and
// Core admission are synthetic. This is not live or full cross-owner UAT.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import JSZip from 'jszip';
import {buildWeb} from '../scripts/v1/build-web.mjs';
import {encodeWorkbook} from '../v1/web/shared/workbooks.mjs';
import {createDatabase,syntheticAdmission} from './v1-product/helpers.mjs';
import {handle} from '../v1/services/roster/service.mjs';
import {canonical,prepareOperation,query} from '../v1/runtime/store.mjs';
const folder=await mkdtemp(path.join(tmpdir(),'gsis-roster-tables-')), h=await createDatabase('roster');
const schoolId='opening-school',now=Date.now(),today=new Date(now+28800000).toISOString().slice(0,10),year=today.slice(0,4);
const people=['Alice','Bob'].map(name=>({staffId:name.toLowerCase(),id:name.toLowerCase(),name,active:true,eo:true,role:'Teacher',groups:[],employment:'Full-time'}));
const response=data=>Response.json({ok:true,data});
const env={SERVICE_NAME:'roster',SCHOOL_ID:schoolId,GSIS_SECRET:'synthetic-test-only',get DB(){return h.db;},get ARTIFACTS(){return h.bucket;},CONTACTS:{fetch:async()=>response({schoolId,revision:'contacts-1',asOf:now,people,dependencies:[],smcIds:['alice']})},CALENDAR:{fetch:async request=>{const b=await request.json();return response({rows:[{date:b.from,available:true,schoolDay:true,parity:'single',revision:'cal-1'}],revision:'cal-1',asOf:now});}},DEPLOY:{fetch:async()=>response({schoolId,publicationId:'pub',publicationSequence:1,calculationVersion:'wi/1',rows:people.map(p=>({staffId:p.id,quality:'verified',budget:84,weightedWi:30,factor:5/7,periodCap:null})),dependencies:[]})},VENUES:{fetch:async()=>response({venues:[]})},CORE:{fetch:async()=>response({state:'resolved'})}};
const principal={schoolId,actorId:'admin-account',staffId:'alice',email:'admin@example.invalid',sessionId:'test-session',decisionId:'test-decision',validUntil:now+600000,impersonating:false,capabilities:['admin','roster.admin','roster.own','roster.read','roster.write'],requestDigest:'a'.repeat(64),action:'roster.own'};
const context=(pathname,body)=>({env,principal,now,clock:()=>now,path:pathname,body,method:'POST',request:new Request('https://test.invalid'+pathname)});
const calls=[];let loseNextSave=false,browser;
async function owner(pathname,body={}) {
 if(body.requestId&&!body.operationId) body={...body,operationId:body.requestId}; // shared client transport normalization
 if(body.operation==='saveOpeningBalances'){
  calls.push(structuredClone(body));
  const op=await prepareOperation(h.db,{schoolId,actorId:principal.actorId,operationId:body.requestId,action:'roster.saveOpeningBalances',intent:body,now,validUntil:principal.validUntil,authorization:principal});
  await syntheticAdmission(h.db,op);
 }
 const result=await handle(context(pathname,body));
 if(body.operation==='saveOpeningBalances'&&loseNextSave){loseNextSave=false;throw Error('Synthetic response lost after owner commit');}
 return result;
}
try {
 const unconfigured=await owner('/profile');assert.equal(unconfigured.historyCoverage,undefined);
 await assert.rejects(()=>owner('/operations',{operation:'openingBalances'}),/fresh start/);
 for(const [key,value] of Object.entries({effectiveDate:year+'-01-01',fairnessMode:'opening-balances'}))await h.db.prepare('INSERT INTO roster_records(school_id,collection,record_id,revision,payload_json) VALUES(?,?,?,1,?)').bind(schoolId,'freshStart',key,canonical({kind:'map',data:value})).run();
 const profile=await owner('/profile');assert.equal(profile.historyCoverage.since,year+'-01-01');
 await buildWeb(folder);assert((await readFile(path.join(folder,'roster/index.html'),'utf8')).includes('/v1/shared/roster-table-ui.js'));
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||chromium.executablePath()});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.exposeFunction('ownerRequest',async(pathname,body)=>{try{return {ok:true,data:await owner(pathname,body)};}catch(error){return {ok:false,message:error.message,status:error.status||500};}});
 await page.route('https://test.invalid/**',async route=>{const pathname=new URL(route.request().url()).pathname;const file=path.join(folder,pathname.slice(1));try{await route.fulfill({body:await readFile(file),contentType:pathname.endsWith('.js')||pathname.endsWith('.mjs')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html'});}catch{await route.fulfill({body:'<!doctype html><main id="content"></main>',contentType:'text/html'});}});
 await page.goto('https://test.invalid/test.html');
 await page.addStyleTag({path:path.join(folder,'v1/shared/suite.css')});await page.addStyleTag({path:path.join(folder,'v1/shared/core-table.css')});
 await page.evaluate(({schoolId,profile,today})=>{
  window.GSISV1={module:'roster',getSession:async()=>({schoolId,user:{accountId:'admin-account'},capabilities:['admin'],impersonating:false}),capable:()=>true,request:async(_service,path,{body}={})=>{const response=await ownerRequest(path,body);if(!response.ok)throw Object.assign(Error(response.message),{status:response.status});return response.data;}};
  window.fixtureContext={container:document.getElementById('content'),profile,today:()=>today,status(){},api:(_route,body)=>GSISV1.request('roster','/operations',{body})};
 },{schoolId,profile,today});
 await page.addScriptTag({path:path.join(folder,'roster/roster-operations-ui.js')});
 assert.equal(await page.evaluate(p=>RosterOpsUI.pages(p).some(x=>x.name==='Opening balances'),unconfigured),false);
 assert.equal(await page.evaluate(p=>RosterOpsUI.pages(p).some(x=>x.name==='Opening balances'),profile),true);
 await page.addScriptTag({path:path.join(folder,'v1/shared/core-table.js')});await page.addScriptTag({url:'https://test.invalid/v1/shared/roster-table-ui.js'});
 await page.evaluate(()=>RosterOpsUI.render('Opening balances',fixtureContext));await page.locator('.opening-grid').waitFor();
 const data=await owner('/operations',{operation:'openingBalances'}),book=await page.evaluate(({data,schoolId})=>GSISV1RosterTables.workbook(data,schoolId),{data,schoolId});
 for(const row of book.sheets.Balances.rows){row[3]=20;row[4]=4;}
 const invalid=structuredClone(book);invalid.sheets.Balances.rows[1][3]=-1;
 await page.evaluate(()=>GSISV1RosterTables.openImport());
 const input=page.getByLabel('Opening balances workbook');
 await input.setInputFiles({name:'bad.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await encodeWorkbook(invalid,{Zip:JSZip}))});
 await page.locator('dialog [aria-invalid=true]').waitFor();assert(await page.getByRole('button',{name:'Review in Opening balances'}).isDisabled());assert.equal(calls.length,0);
 await input.setInputFiles({name:'valid.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await encodeWorkbook(book,{Zip:JSZip}))});
 await page.getByRole('button',{name:'Review in Opening balances'}).click();await page.locator('[data-opening-apply]').waitFor();assert.equal(calls.length,0);
 await page.locator('[data-opening-apply]').click();assert.equal(calls.length,0);await page.locator('[data-opening-reason]').fill('Reviewed synthetic opening balances');
 loseNextSave=true;await page.locator('[data-opening-save]').click();await page.locator('[data-opening-status]').filter({hasText:'Synthetic response lost'}).waitFor();assert.equal(calls.length,1);
 await h.restart();await page.locator('[data-opening-save]').click();await page.locator('[data-opening-status]').filter({hasText:'Saved 2 opening balances'}).waitFor();assert.equal(calls.length,2);assert.equal(calls[0].requestId,calls[1].requestId);
 const durable=await owner('/operations',{operation:'openingBalances'});assert(durable.confirmed);assert(durable.rows.every(row=>row.cumulativeQuota===20&&row.cumulativeDone===4&&row.version===1));assert.equal((await query(h.db,'SELECT * FROM roster_openings WHERE school_id=?',[schoolId])).length,2);
 const negatives=await page.evaluate(({book,data,schoolId})=>{
  const check=change=>{const copy=structuredClone(book);change(copy);return GSISV1RosterTables.validate(copy,data,schoolId).errors.length>0;};
  return [check(b=>b.metadata['School ID']='foreign'),check(b=>b.sheets.Balances.rows[1][0]=b.sheets.Balances.rows[0][0]),check(b=>b.sheets.Balances.rows.pop()),check(b=>b.sheets.Baseline.rows[0][3]=99),check(b=>b.sheets.Balances.rows[0][1]='Other teacher'),check(b=>b.metadata.Revision='999'),check(b=>b.sheets.Balances.rows[0][5]='2026-02-30')];
 },{book,data,schoolId});assert(negatives.every(Boolean));
 assert.equal(await page.evaluate(({book,data,schoolId})=>GSISV1RosterTables.validate(book,data,schoolId).errors.length>0,{book,data:durable,schoolId}),true,'saved changes make old workbook stale');
 const currentBook=await page.evaluate(({data,schoolId})=>GSISV1RosterTables.workbook(data,schoolId),{data:durable,schoolId});
 await page.evaluate(()=>GSISV1RosterTables.openImport());await page.getByLabel('Opening balances workbook').setInputFiles({name:'before-race.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await encodeWorkbook(currentBook,{Zip:JSZip}))});
 await page.getByRole('button',{name:'Review in Opening balances'}).waitFor();await page.waitForFunction(()=>!document.querySelector('dialog button').disabled);
 await owner('/operations',{operation:'saveOpeningBalances',revision:durable.revision,requestId:'external-reviewed-change',reason:'Concurrent synthetic update',rows:[{...durable.rows[1],cumulativeQuota:21}]});
 await page.getByRole('button',{name:'Review in Opening balances'}).click();await page.locator('dialog [role=status]').filter({hasText:'Roster changed after export'}).waitFor();assert.equal(calls.length,3,'stale preview causes no additional save');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.evaluate(()=>{GSISV1.capable=()=>false;dispatchEvent(new Event('gsis:tables-ready'));});assert(await page.locator('.gsis-core-import').first().isDisabled());
 assert.match(await page.evaluate(()=>GSISV1RosterTables.openImport().then(()=>'',error=>error.message)),/administrator/);
 assert.deepEqual(errors,[]);console.log('PASS Roster canonical XLSX validation; no writes before native preview/reason/save; real D1 commit with lost-response retry after restart; stale/foreign/duplicate/malformed/permission rejection; configured-only profile navigation.');
} finally {await browser?.close();await h.close();await rm(folder,{recursive:true,force:true});}
