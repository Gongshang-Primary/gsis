// Local synthetic browser acceptance. No school service or live record is used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const JSZip=require('jszip');
const root=path.resolve(__dirname,'..'),out=process.env.GSIS_QA_OUTPUT||path.resolve(root,'../qa609-roster');
const days=['Monday','Tuesday','Wednesday','Thursday','Friday'],people=['Alpha Tan','Beta Lim','Gamma Lee','Delta Ong'];
function week(even){return {days,maxPeriod:16,perDay:17,blocks:people.map((name,t)=>({name,cells:Array.from({length:85},(_,i)=>{
 const p=i%17,d=Math.floor(i/17);
 if(p===0)return ['Duty','','Hall',''];
 if(p===16)return ['CCA','P6 Courage','Field','Sports'];
 if(p===3+t)return ['Recess duty','','Canteen',''];
 if(p>=1&&p<=12&&p!==8)return [p%3===0?'Mathematics':even?'English':'Science',t<2?'P6 Courage':t===2?'P5 Care':'P1 Respect',t<2?'F3-01':'F2-02',t<2?'Group '+(t+1):d===2?'Support group':''];
 return ['','','',''];
})}))};}
const model={layoutMode:'odd-even',sourceMode:'synthetic',odd:week(false),even:week(true),timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},teacherCount:4,maxPeriod:16,recesses:[1,2,3,4,5,6].map(level=>({level,period:level+2}))};
const entry={id:'fixture',name:'Synthetic acceptance timetable',from:'2026-01-01',to:'2099-12-31',teacherCount:4,layoutMode:model.layoutMode};
const requests=[],errors=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.GSIS_CHROMIUM||chromium.executablePath(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
 const page=await browser.newPage({viewport:{width:1366,height:768},acceptDownloads:true});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.print=()=>{window.__printCount=(window.__printCount||0)+1;};});
 await page.route('https://accounts.google.com/**',route=>route.abort());
 await page.route('https://roster.local/**',async route=>{
  const request=route.request(),url=new URL(request.url()),action=url.pathname.split('/').pop();
  if(url.pathname.startsWith('/api/')){
   const input=JSON.parse(request.postData()||'{}');requests.push({action,input});
   if(action==='config')return route.fulfill({json:{clientId:'synthetic-client'}});
   const calendar={available:true,date:input.date,schoolDay:true,term:4,schoolWeek:2,parity:'even'};
   const data=action==='profile'?{version:'0.6.09',user:{email:'synthetic@gsps.edu.sg',smc:true,accessVerified:true},revision:1,entries:[entry],active:entry,selected:entry,selection:'current',...(input.preload?{model,calendar}:{})}:action==='read'?{revision:1,active:entry,selected:entry,selection:'current',model,calendar}:{};
   return route.fulfill({json:{ok:true,data}});
  }
  const asset=path.join(root,'roster-update/public',url.pathname==='/'?'index.html':url.pathname.slice(1));
  return fs.existsSync(asset)?route.fulfill({path:asset}):route.fulfill({status:404,body:'Not found'});
 });
 await page.goto('https://roster.local/');
 await page.locator('.function-tile').first().waitFor();
 assert.equal(requests.filter(x=>x.action==='profile'&&x.input.preload).length,1);
 await page.locator('#nav [data-page="Baseline Timetable"]').click();
 assert.equal(await page.locator('#savedTimetables').isVisible(),true);
 assert.equal(await page.locator('#uploadForm').isVisible(),false);
 await page.screenshot({path:path.join(out,'saved.png')});
 await page.locator('[data-baseline="upload"]').click();
 assert.equal(await page.locator('input[name="last"]').inputValue(),'16');
 assert.match(await page.locator('select[name="recess6"] option:checked').innerText(),/P8.*11:00.*11:30/);
 assert.match(await page.locator('select[name="recess1"] option:checked').innerText(),/P3.*08:30.*09:00/);
 await page.screenshot({path:path.join(out,'upload.png'),fullPage:true});
 await page.locator('#nav [data-page="Timetable"]').click();
 await page.locator('#nameSearch').waitFor();
 assert.equal(await page.locator('[data-timetable="teacher"]').getAttribute('aria-current'),'page');
 await page.locator('#nameSearch').fill('eta');
 assert.equal(await page.locator('#nameOptions [role="option"]').count(),1);
 await page.locator('#nameSearch').press('Enter');
 assert.equal(await page.locator('#nameSearch').inputValue(),'Beta Lim');
 await page.locator('#lastPeriod').selectOption('12');
 assert.equal(await page.locator('.timetable').first().locator('thead tr:last-child th').count(),14);
 assert.match(await page.locator('.week-sheet').first().innerText(),/Beta Lim/);
 await page.screenshot({path:path.join(out,'teacher.png'),fullPage:true});
 await page.locator('[data-timetable="class"]').click();
 await page.locator('#nameSearch').fill('Cour');await page.locator('#nameSearch').press('Enter');
 const classText=await page.locator('.week-sheet').first().innerText();
 assert.match(classText,/Alpha Tan/);assert.match(classText,/Beta Lim/);assert.match(classText,/Group 1/);assert.match(classText,/Group 2/);assert.match(classText,/Recess \(P6\)/);
 assert.equal(await page.locator('#lastPeriod').inputValue(),'12');
 await page.screenshot({path:path.join(out,'class.png'),fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.locator('#exportExcel').click();const download=await downloadPromise;
 const xlsx=path.join(out,'class.xlsx');await download.saveAs(xlsx);
 const zip=await JSZip.loadAsync(fs.readFileSync(xlsx));assert.equal(Object.keys(zip.files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length,2);
 assert.match(await zip.file('xl/worksheets/sheet1.xml').async('string'),/Recess \(P6\)/);
 await page.locator('#print').click();
 assert.equal(await page.locator('#rosterPrint .week-sheet').count(),2);
 assert.equal(await page.locator('#rosterPrint .timetable').first().locator('thead tr:last-child th').count(),14);
 await page.pdf({path:path.join(out,'class.pdf'),preferCSSPageSize:true,printBackground:true});
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
 await page.locator('[data-timetable="export"]').click();
 assert.equal(await page.locator('#lastPeriod').inputValue(),'12');
 await page.locator('#allTeachers').click();assert.equal(await page.locator('#rosterPrint .week-sheet').count(),8);
 await page.pdf({path:path.join(out,'all-teachers.pdf'),preferCSSPageSize:true,printBackground:true});
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
 await page.locator('#exportFormat').selectOption('excel');
 const bulkPromise=page.waitForEvent('download');await page.locator('#allClasses').click();await (await bulkPromise).saveAs(path.join(out,'all-classes.xlsx'));
 assert.equal(requests.filter(x=>x.action==='read').length,0,'Opening views and exporting must reuse the preloaded model');
 await page.reload();await page.locator('.function-tile').first().waitFor();await page.locator('#nav [data-page="Timetable"]').click();
 assert.equal(await page.locator('#lastPeriod').inputValue(),'12','Preference survives page reload');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'The page must contain the horizontal timetable scroll');
 assert.deepEqual(errors,[]);
 const report={browser:await browser.version(),baselineDefault:'saved',timetableDefault:'teacher',recessDefaults:true,partialNameSearch:true,sharedPeriodCutoff:12,selectedClassLogicalPages:2,allTeacherLogicalPages:8,noReadForViewOrExport:true,preloadCalls:requests.filter(x=>x.action==='profile'&&x.input.preload).length,excelArchiveValid:true,pageErrors:errors};
 fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification/609-roster-browser.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
