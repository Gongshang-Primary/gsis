'use strict';
// Production UI + adapter/domain, with synthetic Contacts/Drive and 80 ms per API call.
// Comparison is local fixture latency, never a measurement of the live school service.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),O=require('../shared/roster-operations.js'),delay=80;
const read=(file,baseline)=>baseline?execFileSync('git',['show','v0.7.16:'+file],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,file),'utf8');
function fixture(baseline){
 const box={module:{exports:{}}};vm.runInNewContext(read('shared/roster-inbox.js',baseline),box);const I=box.module.exports,now=Date.now();let held=false,allow=true,clock=now,durable=I.initial();
 let lose=false;const calls=[],reads={inbox:0,operations:0,writes:0};
 const people=[{id:'admin',name:'Admin',active:true,mobile:'90000001'},{id:'duty',name:'Duty SMC',active:true,mobile:'90000002'},{id:'teacher',name:'Teacher',active:true,mobile:'90000003'}],contacts={rosterPeople:people,rosterSMCIds:['duty'],rosterAdminIds:['admin']};
 const ctx={service:true,now,user:{staffId:'admin',email:'admin@school.test',admin:true,smc:false},people,smcIds:['duty'],adminIds:['admin'],currentDutyIds:['duty'],uuid:crypto.randomUUID,digest:JSON.stringify};
 for(let n=0;n<16;n++)I.ingest(durable,ctx,{message:{from:'6590000003',id:'incoming-'+n,type:'text',text:'Teacher message '+n,timestamp:now-1000+n}});
 I.ingest(durable,ctx,{message:{from:'6590000003',id:'voice',type:'audio',timestamp:now,audio:{captureStatus:'stored',objectKey:'inbox/test/voice',mediaId:'private-media-id',mimeType:'audio/ogg',voice:true}}});
 I.ingest(durable,ctx,{message:{from:'6590000004',id:'other',type:'text',text:'Other conversation',timestamp:now-2000}});
 const counters=()=>({...reads});
 const scope=vm.createContext({Date:class extends Date{static now(){return clock;}},GSISRosterInbox:I,GSISRosterOperations:O,ROSTER_DATA:'folder',Utilities:{getUuid:crypto.randomUUID},props_:()=>({getProperty:()=> 'inbox-file',setProperty(){}}),rosterReadFile_:()=>{reads.inbox++;return JSON.stringify(durable);},rosterFindFile_:()=>null,rosterDriveRequest_:(_url,options)=>{assert(held);reads.writes++;durable=JSON.parse(options.payload);},LockService:{getScriptLock:()=>({})},deployLock_:()=>{assert(!held);held=true;return true;},deployUnlock_:()=>{assert(held);held=false;},error_:(status,message)=>{throw Object.assign(Error(message),{status});},rosterOperationsAuthority_:(_c,identity)=>({staffId:identity.email.startsWith('duty')?'duty':'admin',email:identity.email,admin:allow,smc:allow}),rosterOperationsDigest_:value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'),rosterOperationsState_:()=>{reads.operations++;return {...O.initial(),smcDutyRoster:[{date:new Date(clock+8*3600000).toISOString().slice(0,10),staffIds:['duty']}]};}});
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(read('backend/RosterInbox.gs',baseline),scope);
 const operation=(input,email='admin@school.test')=>scope.rosterInboxDispatch_({identity:{email},input},contacts);
 return {I,ctx,scope,calls,counters,operation,get state(){return durable;},deny:()=>allow=false,loseNext:()=>lose=true,setClock:value=>clock=value,api:async p=>{calls.push(p);await new Promise(r=>setTimeout(r,delay));const result=operation(p);if(lose&&p.operation==='inboxReply'){lose=false;throw Error('Connection lost after accepted save');}return JSON.parse(JSON.stringify(result));}};
}
// Current contracts run without historical Git objects. An explicit benchmark
// request still loads the authentic baseline and fails if it is unavailable.
const historicalComparison=process.env.GSIS_RUN_HISTORICAL_BENCHMARKS==='1',comparisonModes=historicalComparison?[true,false]:[false],currentVersion=require('../package.json').gsisRelease;
if(!historicalComparison)console.log('HISTORICAL COMPARISON NOT RUN: v0.7.16; set GSIS_RUN_HISTORICAL_BENCHMARKS=1 with the original Git objects. Current assertions remain active.');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',headless:true,args:['--no-sandbox']});
 const results=[];
 try{
  for(const baseline of comparisonModes){
   const f=fixture(baseline),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><main id="content"></main>'}));await page.goto('https://roster.test/');
   await page.exposeFunction('fixtureApi',p=>f.api(p));
   for(const file of ['roster.css','roster-stapler.css','roster-inbox.css'])await page.addStyleTag({content:read('roster-update/public/'+file,false)});
   await page.addScriptTag({content:read('roster-update/public/roster-inbox-ui.js',baseline)});
   await page.evaluate(()=>{window.__ctx={container:document.getElementById('content'),profile:{user:{email:'admin@school.test',admin:true,smc:false}},api:async(_route,p)=>{const value=await fixtureApi(p);window.__completed=(window.__completed||0)+1;return value;}};window.__mount=()=>RosterInboxUI.render(__ctx);});
   const metrics={version:baseline?'v0.7.16':currentVersion};
   async function measure(name,action){const before=f.calls.length,reads=f.counters(),start=performance.now();await action();metrics[name]={milliseconds:+(performance.now()-start).toFixed(1),requests:f.calls.length-before,inboxReads:f.counters().inbox-reads.inbox,operationsReads:f.counters().operations-reads.operations};}
   await measure('firstOpen',()=>page.evaluate(()=>__mount()));
   await measure('returnOpen',()=>page.evaluate(async()=>{RosterInboxUI.unmount();await __mount();}));
   await measure('listRefresh',async()=>{const done=await page.evaluate(()=>__completed);await page.locator('[data-inbox-refresh]').click();await page.waitForFunction(n=>__completed>n,done);});
   await measure('search',async()=>{const done=await page.evaluate(()=>__completed);await page.locator('[data-inbox-search]').fill('Teacher');await page.waitForFunction(n=>__completed>n,done);assert.equal(await page.locator('[data-conversation]').count(),1);});
   await measure('selectThread',async()=>{await page.locator('[data-conversation="6590000003"]').click();await page.locator('[data-inbox-reply]').waitFor();});
   await page.locator('[data-inbox-reply]').fill('A queued reply');
   await measure('queueReply',async()=>{await page.locator('[data-inbox-send]').click();await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false'&&!!document.querySelector('.inbox-outbound'));});
   assert.equal(f.state.messages.filter(m=>m.direction==='outbound').length,1);assert.match(await page.locator('.inbox-outbound').innerText(),/queued/);assert.equal(f.state.messages.find(m=>m.direction==='outbound').status,'queued');
   if(!baseline){
    assert.equal(metrics.queueReply.requests,1,'accepted reply snapshot needs no follow-up backend read');
    for(const action of Object.values(metrics).filter(v=>v&&typeof v==='object'))assert.equal(action.operationsReads,0,'no current-duty storage read for an actor absent from retained alert recipients');
    await page.locator('[data-inbox-reply]').fill('Draft survives refresh');
    await page.evaluate(()=>{const input=document.querySelector('[data-inbox-reply]');input.focus();input.setSelectionRange(2,7);window.__voice=document.querySelector('audio');window.__paused=0;__voice.pause=()=>__paused++;Object.defineProperty(__voice,'paused',{configurable:true,value:false});__voice.dispatchEvent(new Event('play'));window.scrollTo(0,240);window.__scroll=scrollY;});
    // Start a manual refresh without taking composer focus, then edit while the read waits.
    const done=await page.evaluate(()=>{const n=__completed;document.querySelector('[data-thread-refresh]').click();return n;});
    assert.equal(await page.locator('[data-inbox-reply]').isEnabled(),true);
    assert.equal(await page.locator('[data-thread-refresh]').isDisabled(),true);
    await page.waitForFunction(n=>__completed>n,done);
    assert.equal(await page.locator('[data-inbox-reply]').inputValue(),'Draft survives refresh');
    assert.deepEqual(await page.evaluate(()=>({voice:__voice===document.querySelector('audio'),paused:__paused,focused:document.activeElement.matches('[data-inbox-reply]'),selection:[document.activeElement.selectionStart,document.activeElement.selectionEnd],scroll:scrollY===__scroll})),{voice:true,paused:0,focused:true,selection:[2,7],scroll:true});
    assert.equal(await page.locator('[data-inbox-reply]').isEnabled(),true);
    // A lost response replays the same command and returns the CURRENT durable snapshot.
    await page.evaluate(()=>Object.defineProperty(__voice,'paused',{configurable:true,value:true}));
    await page.locator('[data-inbox-reply]').fill('Retry this exact reply');f.loseNext();
    await page.locator('[data-inbox-send]').click();await page.locator('[data-inbox-retry]').waitFor();
    const lost=f.calls.at(-1),sent=f.state.messages.find(m=>m.requestId===lost.requestId),beforeReplay=f.calls.length,writes=f.counters().writes;
    sent.status='sent';sent.deliveryStatus='delivered';const retained=f.state.threads.find(t=>t.waId===lost.waId);retained.revision++;
    await page.locator('[data-inbox-retry]').click();await page.waitForFunction(()=>!document.querySelector('[data-inbox-retry]')&&document.getElementById('content').getAttribute('aria-busy')==='false');
    assert.equal(f.calls.length-beforeReplay,1);assert.deepEqual(f.calls.at(-1),lost);assert.equal(f.counters().writes,writes);assert.equal(f.state.messages.filter(m=>m.requestId===lost.requestId).length,1);
    assert.equal(await page.locator('[data-message-id="'+sent.id+'"] .inbox-delivery').innerText(),'delivered');assert.equal(await page.locator('[data-inbox-reply]').inputValue(),'');
    // A fresh role/duty check remains mandatory when this actor has a retained alert.
    const before=f.counters();assert.equal(f.operation({operation:'inboxList'},'duty@school.test').alertCount,2);assert.equal(f.counters().operations,before.operations+1);
    const mediaReads=f.counters().operations;f.operation({operation:'inboxMediaAuthorize',waId:'6590000003',messageId:'voice'},'duty@school.test');assert.equal(f.counters().operations,mediaReads,'private media checks authority without unused duty display data');
    f.deny();assert.throws(()=>f.operation({operation:'inboxList'}),{status:403});assert.throws(()=>f.operation({operation:'inboxMediaAuthorize',waId:'6590000003',messageId:'voice'}),{status:403});
   }
   assert.deepEqual(errors,[]);results.push(metrics);await page.close();
  }
  if(historicalComparison){assert.equal(results[0].queueReply.requests,2,'baseline includes the serial follow-up thread read');assert.equal(results[0].queueReply.operationsReads,2);}
  assert.equal(results.at(-1).queueReply.requests,1);assert.equal(results.at(-1).queueReply.operationsReads,0);
  // Full-size list: count phone lookups to prove alert counting no longer resolves every name.
  const nameWork=[];
  for(const baseline of comparisonModes){const f=fixture(baseline);let lookups=0;const people=Array.from({length:150},(_,i)=>({id:'person-'+i,name:'Person '+i,active:true,get mobile(){lookups++;return String(6591000000+i);}}));const state=f.I.initial();state.threads=Array.from({length:5000},(_,i)=>({waId:String(6592000000+i),profileName:'Contact '+i,revision:1,lastMessageAt:1,alertRecipientIds:[]}));const ctx={...f.ctx,people};const start=performance.now();const data=f.I.list(state,ctx,{limit:50,filter:'open'});assert.equal(data.threads.length,50);assert.equal(data.alertCount,0);nameWork.push({version:baseline?'v0.7.16':currentVersion,milliseconds:+(performance.now()-start).toFixed(1),phoneLookups:lookups});}
  if(historicalComparison)assert.equal(nameWork[0].phoneLookups,757500);assert.equal(nameWork.at(-1).phoneLookups,150);
  fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification/717-inbox-performance.json'),JSON.stringify({historicalComparison,syntheticApiDelayMs:delay,actions:results,listNameWork:nameWork},null,2)+'\n');
  console.log('PASS Inbox performance: accepted reply uses 1 request; non-recipient duty reads removed; fresh authority and relevant duty checks kept; refresh preserves draft, selection, scroll and live audio; 5,000-thread list uses 150 phone lookups. Synthetic timing report: verification/717-inbox-performance.json');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
