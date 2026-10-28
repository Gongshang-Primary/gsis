'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module'),{chromium}=require('playwright');
const file=path.resolve('tests/roster-draft-baseline-cache-browser.cjs'),source=fs.readFileSync(file,'utf8'),box={require:createRequire(file),__dirname:path.dirname(file),console,structuredClone,Buffer,URL,setTimeout};
vm.runInNewContext(source.slice(0,source.indexOf('\n(async()=>'))+'\nthis.fixtureTools={fixture,harness,ready};',box);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const {fixture,harness,ready}=box.fixtureTools,f=fixture(),h=await harness(browser,f),page=h.page,days=[],calendars=[];
  const next=async(queue)=>{for(let i=0;i<200&&!queue.length;i++)await new Promise(r=>setTimeout(r,5));assert(queue.length,'expected read reached its response gate');return queue.shift();};
  const baseline={date:'2026-10-14',baselineId:'baseline-a',source:'baseline',sourceRevision:1,publicationRevision:0,periods:[],teachers:[]};
  const confirmed=revision=>({...baseline,source:'confirmed',confirmedRevision:revision,sourceRevision:revision+1,periods:[{period:0,start:'07:00',end:'07:30'},{period:1,start:'07:30',end:'08:00'}],teachers:[{staffId:'alice',name:'Alice Cached',timetableName:'Alice Cached',cells:[['MA','4A','Room '+revision,''],['','','','']]}]});
  const send=(route,data)=>route.fulfill({json:{ok:true,data}}),calendar=()=>({...f.profile,modelId:'baseline-a',modelUnchanged:true,calendar:{available:true,date:baseline.date,schoolDay:true,parity:'odd',term:4,schoolWeek:1}});
  await page.goto('https://roster.test/');await ready(page,'Alice Cached');
  await page.route('**/api/operations',route=>{if(route.request().postDataJSON().operation==='timetableDay'){days.push(route);return;}return route.fallback();});
  await page.route('**/api/read',route=>{if(route.request().postDataJSON().calendar!==false){calendars.push(route);return;}return route.fallback();});
  await page.locator('[data-page="Timetable"]').click();await page.locator('#nameSearch').fill('Ali');
  await page.evaluate(()=>{window.oldPicker=document.querySelector('#nameSearch');});
  await send(await next(days),baseline);const calendarRead=await next(calendars);
  assert.deepEqual(await page.evaluate(()=>({same:oldPicker===document.querySelector('#nameSearch'),value:document.querySelector('#nameSearch').value})),{same:true,value:'Ali'},'baseline status must preserve the existing picker and typed search');
  await send(calendarRead,calendar());await page.waitForFunction(()=>document.querySelector('#timetableCalendar').textContent.includes('Term 4'));
  assert.equal(await page.evaluate(()=>oldPicker===document.querySelector('#nameSearch')),true,'Calendar completion must not rebuild the timetable');
  await page.locator('#nameSearch').fill('Alice Cached');await page.locator('#nameSearch').press('Enter');
  await page.evaluate(()=>{window.clock=Date.now();Date.now=()=>clock;});
  const refresh=()=>page.evaluate(()=>{clock+=61000;document.dispatchEvent(new Event('visibilitychange'));});
  await refresh();await send(await next(days),confirmed(1));await page.locator('[data-timetable-source="confirmed"]').waitFor();
  assert.equal(await page.evaluate(()=>oldPicker.isConnected),false,'new confirmed content must rebuild the timetable');
  assert.match(await page.locator('#timetables').innerText(),/Room 1/);
  await page.evaluate(()=>{window.oldPicker=document.querySelector('#nameSearch');});
  await refresh();await send(await next(days),confirmed(2));await page.waitForFunction(()=>document.querySelector('#timetables').textContent.includes('Room 2'));
  assert.equal(await page.evaluate(()=>oldPicker.isConnected),false,'changed confirmed content must replace the previous grid');
  await refresh();await send(await next(days),baseline);await send(await next(calendars),calendar());
  await page.waitForFunction(()=>!document.querySelector('[data-timetable-source="confirmed"]'));
  assert.match(await page.locator('#timetables').innerText(),/EL/,'removing the suspension restores the baseline grid');
  assert.deepEqual([...h.errors],[]);await h.context.close();
  console.log('PASS timetable status/Calendar updates preserve the picker; confirmed content changes and removal redraw the grid.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
