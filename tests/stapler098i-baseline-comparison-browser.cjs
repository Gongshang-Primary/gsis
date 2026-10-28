'use strict';
// Catches hidden initial comparisons, toggles reset by planner redraws, and comparison blocking independent plans.
// Chromium drives the real UI against the Apps Script persistence harness; all school data is synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{chromium}=require('playwright'),S=require('../shared/roster-stapler.js'),{harness}=require('./stapler715-persistence.cjs');
const date='2026-10-28',people=[{id:'alice',name:'Alice',active:true}],periods=[{period:0,startMinutes:420,endMinutes:450},{period:1,startMinutes:450,endMinutes:480}],day={date,id:'baseline',parity:'even',verified:true,schoolDay:true,endOfDayMinutes:480,periods,teachers:[{staffId:'alice',name:'Alice',cells:[['EL','Exam','Baseline room',''],[]]}],formClasses:[{id:'exam',name:'Exam',traditional:false}],recesses:[]};
const h=harness(day,people),blankDay={date,verified:true,schoolDay:true,periods:[],teachers:[],formClasses:[],recesses:[]},standalone=harness(blankDay,people),errors=[];
function request(store,input){const result=store.call(input).result;assert.equal(result.ok,true,result.error);return result.data;}
async function open(browser,store,initialDate){
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><title>Baseline comparison</title><main></main></html>'}));await page.goto('https://roster.test/');
 await page.exposeFunction('staplerApi',input=>request(store,input));
 for(const file of ['roster.css','roster-operations.css','roster-stapler.css'])await page.addStyleTag({path:'roster-update/public/'+file});
 for(const file of ['shared/roster-stapler.js','roster-update/public/roster-stapler-ui.js'])await page.addScriptTag({path:file});
 await page.evaluate(async({date,initialDate})=>{await RosterStaplerUI.render({container:document.querySelector('main'),initialDate,today:()=>date,profile:{revision:1,user:{email:'admin@gsps.edu.sg',staffId:'alice',admin:true,smc:true,accessVerified:true}},status(){},api:async(_,input)=>staplerApi(input)});},{date,initialDate});return page;
}
async function recoveryPlan(page){const ready=page.waitForEvent('download');await page.locator('[data-export-recovery]').click();const download=await ready;return JSON.parse(fs.readFileSync(await download.path(),'utf8')).plan;}
async function settled(page,prefix){try{await page.waitForFunction(prefix=>document.querySelector('[data-plan-meta]')?.textContent.startsWith(prefix)&&document.querySelector('main').getAttribute('aria-busy')==='false',prefix);}catch(error){error.message+='\n'+await page.locator('main').innerText();throw error;}}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const intended=S.apply(S.create(day),{type:'edit',tileId:'baseline:alice:0',patch:{venue:'Intended room'}});
  request(h,{operation:'saveStapler',view:'stapler',date,plan:intended,revision:0,staplerRevision:0,requestId:crypto.randomUUID()});
  const page=await open(browser,h,date),toggle=page.getByRole('checkbox',{name:'Show baseline comparison',exact:true});
  assert.equal(await toggle.isChecked(),true,'a new planner immediately shows available baseline differences');
  assert.match(await page.locator('[data-scroll=teacher] .planner-tile.ghost').innerText(),/Baseline room/);
  assert.match(await page.locator('[data-scroll=teacher] .planner-tile.ghost').getAttribute('aria-label'),/^Baseline comparison:/);
  assert.match(await page.locator('[data-scroll=teacher] [data-tile]').innerText(),/Intended room/);
  const before=await recoveryPlan(page),writes=h.writes();await toggle.uncheck();
  assert.equal(await page.locator('.planner-tile.ghost').count(),0);
  assert.deepEqual(await recoveryPlan(page),before,'turning comparison off preserves the complete local plan');
  assert.equal(await page.evaluate(()=>RosterStaplerUI.isDirty()),false,'comparison visibility is not an edit');assert.equal(h.writes(),writes,'comparison visibility makes no online write');
  await page.locator('[data-scroll=teacher] [data-edit-tile]').click();await page.locator('dialog [name=venue]').fill('Local edited room');await page.locator('dialog button.primary').click();
  assert.equal(await toggle.isChecked(),false,'editing does not reset the comparison choice');
  await page.locator('[data-undo]').click();assert.equal(await toggle.isChecked(),false,'undo retains the choice');await page.locator('[data-redo]').click();assert.equal(await toggle.isChecked(),false,'redo retains the choice');
  await page.locator('[data-save]').click();await settled(page,'Draft saved');assert.equal(await toggle.isChecked(),false,'saving retains the choice');
  await page.locator('[data-confirm]').click();await settled(page,'Confirmed');assert.equal(await toggle.isChecked(),false,'confirmation retains the choice');
  day.teachers[0].cells[0][2]='Replacement baseline room';await page.locator('[data-refresh-lock]').click();await page.locator('[data-scroll=teacher] [data-tile]').waitFor();
  assert.equal(await toggle.isChecked(),false,'refreshing a changed comparison retains the choice');assert.equal(await page.locator('.planner-tile.ghost').count(),0);
  await toggle.check();assert.match(await page.locator('[data-scroll=teacher] .planner-tile.ghost').innerText(),/Replacement baseline room/);
  assert.match(await page.locator('[data-scroll=teacher] [data-tile]').innerText(),/Local edited room/,'replacement baseline never replaces intended content');
  const confirmed=await recoveryPlan(page);delete day.id;day.periods=[];await page.locator('[data-refresh-lock]').click();await page.locator('[data-comparison-status]').waitFor();
  assert.equal(await toggle.isDisabled(),true);assert.match(await page.locator('[data-comparison-status]').innerText(),/Baseline comparison is unavailable/);
  assert.deepEqual(await recoveryPlan(page),confirmed,'losing baseline access preserves the complete confirmed plan');assert.match(await page.locator('[data-plan-meta]').innerText(),/^Confirmed/);
  assert.equal(await page.locator('[data-save]').isDisabled(),false);assert.equal(await page.locator('[data-confirm]').isDisabled(),false,'unavailable comparison does not block confirmation');await page.locator('[data-confirm]').click();await settled(page,'Confirmed');
  await page.close();
  const blank=await open(browser,standalone);await blank.locator('[data-create-standalone]').click();await blank.locator('dialog [name=start]').fill('07:00');await blank.locator('dialog [name=end]').fill('07:30');await blank.locator('dialog [name=endOfDay]').fill('08:00');await blank.locator('dialog button[type=submit]').click();await settled(blank,'Draft saved');
  assert.equal(await blank.getByRole('checkbox',{name:'Show baseline comparison',exact:true}).isDisabled(),true);assert.equal(await blank.locator('.planner-tile.ghost').count(),0);
  await blank.locator('[data-add-class]').click();await blank.locator('dialog [name=name]').fill('Standalone exam');await blank.locator('dialog button.primary').click();await blank.locator('[data-save]').click();await settled(blank,'Draft saved');
  const own=await recoveryPlan(blank);assert.equal(own.classes[0].name,'Standalone exam');assert.match(own.baselineId,/^standalone:/);assert.deepEqual(own.periods,[{period:0,startMinutes:420,endMinutes:450}]);
  await blank.locator('[data-confirm]').click();await settled(blank,'Confirmed');assert.equal(standalone.state().staplerPlans[0].confirmedRevision,2,'a no-baseline standalone plan can save and confirm independently');
  assert.deepEqual(errors,[]);await blank.close();
  console.log('PASS I Chromium baseline comparison: visible by default, optional without plan/write side effects, retained off across edits/undo/redo/save/confirm/refresh, baseline loss preserves confirmation, and no-baseline standalone plans remain editable and confirmable.');
 }finally{await browser.close();h.close();standalone.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
