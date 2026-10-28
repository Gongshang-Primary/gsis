'use strict';
// Exercise the shipped shell's signed request/recovery path with native browser decompression.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{gzipSync}=require('node:zlib'),{chromium}=require('playwright');
const pub=path.resolve(__dirname,'../roster-update/public'),date='2026-10-21';
const query={operation:'read',view:'report',compact:true,date,staffId:'alice'};
const stub=`window.RosterOpsUI={pages:()=>[{name:'Report Absence',icon:'absence-report'}],unmount(){},resetPreloads(){},isDirty:()=>false,seedReport(ctx,data){window.__seed=data;},preload(ctx){window.__ctx=ctx;return Promise.resolve();},render(name,ctx){window.__ctx=ctx;ctx.container.innerHTML='<h2>Report Absence</h2>';return Promise.resolve();}};`;
function fixture(){return {calls:[],revision:1,snapshotRevision:1,key:'a'.repeat(64),profile:{user:{email:'alice@example.test',staffId:'alice',smc:false,admin:false,accessVerified:true},revision:1,entries:[]}};}
function form(f){return {schema:1,date,today:date,minute:480,revision:f.revision,user:f.profile.user,people:[{id:f.profile.user.staffId,name:'Teacher 0',active:true,absenceEligible:true}],types:[],timetablePeople:[{id:f.profile.user.staffId,name:'Teacher 0'}],nameBridges:[],noReliefSubjects:[],checkedAt:date+'T00:00:00Z'};}
function report(f,input){
 const teachers=Array.from({length:104},(_,i)=>({staffId:i?'staff-'+i:f.profile.user.staffId,name:'Teacher '+i,timetableName:'Teacher '+i,cells:Array.from({length:17},(_,p)=>(i+p)%3?['','','','']:['EL','4A','Room 1','Group A'])}));teachers[0].cells[0]=['EL','4A','Room 1',''];
 const row={date:input.date,revision:f.revision,absences:[{id:'absence-'+f.revision}],timetable:{id:'base',staplerRevision:f.snapshotRevision,teachers},baselineTimetable:{id:'base',staplerRevision:0,teachers:teachers.map((t,i)=>({staffId:t.staffId,name:t.name,timetableName:t.timetableName,...(!i?{cells:t.cells.map((c,p)=>p?c:['MTL','4A','Room 1',''])}:{})}))}};
 if(input.timetableTransport!=='gzip-base64-v1')return row;
 const json=JSON.stringify({timetable:row.timetable,baselineTimetable:row.baselineTimetable}),snapshot={schema:1,key:f.key,encoding:'gzip-base64-v1',bytes:Buffer.byteLength(json)};
 if(input.timetableSnapshotKey===f.key)snapshot.unchanged=true;else snapshot.data=f.corrupt?'broken':gzipSync(json).toString('base64');
 return {...row,timetable:null,baselineTimetable:null,timetableSnapshot:snapshot};
}
async function harness(browser,f,{unsupported=false,bootstrap=false}={}){
 const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
 await context.addInitScript(({unsupported})=>{
  const RealDate=Date,clock=RealDate.parse('2026-10-21T00:00:00Z');window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
  window.__decodedSnapshots=0;window.__transportTimings=[];const stream=Blob.prototype.stream;Blob.prototype.stream=function(){window.__decodedSnapshots++;return stream.call(this);};
  window.google={accounts:{id:{initialize(){},renderButton(){}}}};window.setInterval=()=>0;
  if(unsupported)window.DecompressionStream=undefined;
 },{unsupported});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!=='https://roster.test')return route.abort();
  if(url.pathname.startsWith('/api/')){
   const name=url.pathname.slice(5),input=route.request().postDataJSON()||{};f.calls.push({name,input});
   if(name==='config')return route.fulfill({json:{clientId:'synthetic'}});
   if(name==='operations'&&input.operation==='timetableBatch')return route.fulfill({status:503,json:{ok:false,error:'Background preload unavailable in this report-transport fixture.'}});
   let data={};
   if(name==='profile'){data=input.view==='reportForm'?{user:structuredClone(f.profile.user),version:'0.9.3a',reportForm:form(f)}:structuredClone(f.profile);if(input.view==='report')data.reportData=report(f,input);}
   else if(name==='operations'&&input.operation==='read'&&input.view==='reportForm')data=form(f);
   else if(name==='operations'&&input.operation==='read'){
    data=report(f,input);if(f.hold){f.hold=false;await new Promise(resolve=>f.release=resolve);}
   }else if(name==='operations'&&input.operation==='currentDuty')data={date,checkedAt:date+'T00:00:00Z',available:true,people:[]};
   else if(name==='operations'&&input.operation==='acknowledgementStatus')data={date:input.date,revision:f.revision,notice:null};
   else if(name==='operations'&&input.operation==='inboxList')data={threads:[],alertCount:0};
   else if(name==='operations'&&input.operation==='saveAbsence')data={savedIds:['saved']};
   else if(name==='logout')f.signedOut=true;
   else if(name==='session'&&f.signedOut)return route.fulfill({status:401,json:{ok:false,error:'Sign in again.'}});
   else if(!['session'].includes(name))throw Error('Unexpected API '+name+':'+input.operation);
   return route.fulfill({json:{ok:true,data}});
  }
  if(url.pathname==='/roster-operations-ui.js')return route.fulfill({contentType:'text/javascript',body:stub});
  const file=path.resolve(pub,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(pub+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing fixture asset'});
  return route.fulfill({path:file});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://roster.test/'+(bootstrap?'#reportAbsence':''));
 if(!bootstrap){await page.locator('[data-page="Report Absence"]').waitFor();await page.locator('[data-page="Report Absence"]').dispatchEvent('pointerenter');}
 await page.waitForFunction(()=>!!window.__ctx&&document.querySelector('#refresh')?.disabled===false);
 return {context,page,errors};
}
const read=(page,input=query)=>page.evaluate(async input=>{const start=performance.now(),data=await __ctx.api('operations',input);__transportTimings.push(performance.now()-start);return data;},input);
const reads=f=>f.calls.filter(c=>c.name==='operations'&&c.input.operation==='read'&&['report','entry'].includes(c.input.view));
(async()=>{
 assert.match(fs.readFileSync(path.join(pub,'index.html'),'utf8'),/roster-report-cache\.js/,'shipped page loads snapshot cache');
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const f=fixture(),h=await harness(browser,f),{page}=h;
  const first=await read(page);assert.equal(first.timetable.teachers[0].cells[0][0],'EL');assert.equal(first.baselineTimetable.teachers[0].cells[0][0],'MTL');assert.equal(reads(f)[0].input.timetableTransport,'gzip-base64-v1');
  f.revision++;const warm=await read(page);assert.equal(warm.absences[0].id,'absence-2');assert.equal(reads(f).at(-1).input.timetableSnapshotKey,f.key,'warm read revalidates immutable snapshot by key');
  assert.equal(await page.evaluate(()=>__decodedSnapshots),1,'warm unchanged payload never decompresses again');
  const measured={teachers:104,periods:17,plainResponseBytes:Buffer.byteLength(JSON.stringify(report(f,query))),coldResponseBytes:Buffer.byteLength(JSON.stringify(report(f,{...query,timetableTransport:'gzip-base64-v1'}))),warmResponseBytes:Buffer.byteLength(JSON.stringify(report(f,{...query,timetableTransport:'gzip-base64-v1',timetableSnapshotKey:f.key}))),decodedSnapshotBytes:report(f,{...query,timetableTransport:'gzip-base64-v1'}).timetableSnapshot.bytes};
  f.key='c'.repeat(64);await read(page,{...query,date:'2026-10-22'});assert.equal(reads(f).at(-1).input.timetableSnapshotKey,undefined,'different school day independently verifies source');
  measured.coldWarmDateMs=await page.evaluate(()=>__transportTimings.slice(0,3).map(n=>Math.round(n*100)/100));measured.coldWarmDateRequests=reads(f).length;measured.coldWarmDateDecodes=await page.evaluate(()=>__decodedSnapshots);
  f.key='b'.repeat(64);f.revision++;f.snapshotRevision=3;assert.equal((await read(page)).timetable.staplerRevision,3,'changed suspended revision is decoded');
  await page.evaluate(date=>__ctx.invalidateOperations([date]),date);f.corrupt=true;
  const before=reads(f).length,recovered=await read(page);assert.equal(recovered.timetable.staplerRevision,3);assert.equal(reads(f).length-before,2);assert.equal(reads(f).at(-1).input.timetableTransport,undefined,'one plain fallback follows corrupt gzip');f.corrupt=false;
  await page.evaluate(()=>__ctx.api('operations',{operation:'saveAbsence',requestId:'single-save'}));const writes=f.calls.filter(c=>c.input.operation==='saveAbsence');assert.equal(writes.length,1);assert.equal(writes[0].input.timetableTransport,undefined,'write path is never transformed/replayed');
  await read(page);f.profile.user={...f.profile.user,email:'bob@example.test',staffId:'bob'};
  await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('account').textContent==='bob@example.test'&&!document.getElementById('refresh').disabled);await page.locator('[data-page="Report Absence"]').dispatchEvent('pointerenter');await page.waitForFunction(()=>__ctx.profile.user.staffId==='bob');
  await read(page,{...query,staffId:'bob'});assert.equal(reads(f).at(-1).input.timetableSnapshotKey,undefined,'account changes drop former snapshot key');
  f.profile.user.smc=true;await page.locator('#refresh').click();await page.waitForFunction(()=>!document.getElementById('refresh').disabled);await page.locator('[data-page="Report Absence"]').dispatchEvent('pointerenter');await page.waitForFunction(()=>__ctx.profile.user.smc);
  await read(page,{...query,staffId:'bob'});assert.equal(reads(f).at(-1).input.timetableSnapshotKey,undefined,'permission changes drop former snapshot key');
  f.hold=true;await page.evaluate(input=>{window.__pending=__ctx.api('operations',input).then(()=>({ok:true}),e=>({stale:e.stale}));},query);
  for(let i=0;!f.release&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(typeof f.release,'function');
  await page.locator('#logout').click();f.release();assert.equal((await page.evaluate(()=>__pending)).stale,true,'late signed response cannot restore an account snapshot after logout');
  assert.deepEqual(h.errors,[]);await h.context.close();
  const old=fixture(),unsupported=await harness(browser,old,{unsupported:true});await read(unsupported.page);assert.equal(reads(old)[0].input.timetableTransport,undefined);assert.deepEqual(unsupported.errors,[]);await unsupported.context.close();
  const boot=fixture(),bootstrap=await harness(browser,boot,{bootstrap:true});assert.equal(await bootstrap.page.evaluate(()=>__ctx.profile.reportForm.schema),1);const bootProfile=boot.calls.find(c=>c.name==='profile');assert.equal(bootProfile.input.view,'reportForm');assert.equal(bootProfile.input.timetableTransport,undefined,'lightweight bootstrap never requests timetable transport');assert.equal(await bootstrap.page.evaluate(()=>__decodedSnapshots),0);await read(bootstrap.page);assert.equal(reads(boot)[0].input.timetableSnapshotKey,undefined,'first dated report after metadata bootstrap obtains its own source');await read(bootstrap.page);assert.equal(reads(boot).at(-1).input.timetableSnapshotKey,boot.key);assert.equal(await bootstrap.page.evaluate(()=>__decodedSnapshots),1);assert.deepEqual(bootstrap.errors,[]);await bootstrap.context.close();
  const legacy=fixture(),legacyProfile=await harness(browser,legacy);const decodedProfile=await legacyProfile.page.evaluate(date=>__ctx.api('profile',{view:'report',date}),date);assert.equal(decodedProfile.reportData.timetable.teachers[0].cells[0][0],'EL');assert.equal(decodedProfile.reportData.baselineTimetable.teachers[0].cells[0][0],'MTL');assert.equal(legacy.calls.filter(c=>c.name==='profile').at(-1).input.timetableTransport,'gzip-base64-v1');await read(legacyProfile.page);assert.equal(reads(legacy)[0].input.timetableSnapshotKey,legacy.key,'explicit report profile decode remains reusable by the first report refresh');assert.equal(await legacyProfile.page.evaluate(()=>__decodedSnapshots),1);assert.deepEqual(legacyProfile.errors,[]);await legacyProfile.context.close();
  console.log(JSON.stringify({transportFixture:measured,cacheLimits:{entries:24,decodedPayloadBytes:8*1024*1024,singleSnapshotBytes:4*1024*1024},note:'Synthetic API, zero intentional network delay; payload accounting excludes JS object overhead and caller copies. Timings are one Chromium run, not production latency.'}));
  console.log('PASS shipped report transport Chromium: native gzip, baseline/overlay restore, current dynamic records, revision/account/permission isolation, corrupt gzip read-only recovery, unsupported fallback, logout race, lightweight bootstrap and explicit report-profile reuse.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
