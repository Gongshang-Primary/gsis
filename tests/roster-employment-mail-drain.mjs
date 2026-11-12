import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import worker from '../notification-worker/index.js';
import {dispatchDailyEmploymentReports} from '../roster-update/public/_worker.js';
import {readSystemHealth} from '../shared/edge-health.js';
const require=createRequire(import.meta.url),Store=require('../shared/edge-store.js'),database=require('./helpers/chunked-import-db.cjs'),domain=require('./roster701-fixture.cjs'),{parse}=require('acorn');
const now=Date.parse('2026-11-13T08:05:00+08:00'),today='2026-11-13',iso=new Date(now).toISOString(),secret='synthetic-employment-secret'.repeat(2);
const previousNow=Date.now,previousFetch=globalThis.fetch;Date.now=()=>now;
const source=fs.readFileSync('backend/RosterOperations.gs','utf8'),fn=parse(source,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='rosterServiceDispatch_');
function googleTransport(sent){
 const context=vm.createContext({gsisRequireBackendRole_:role=>assert.equal(role,'roster'),rosterEdgeAssertLegacyWrite_:()=>assert.fail('Google record writer is frozen'),MailApp:{getRemainingDailyQuota:()=>100,sendEmail:mail=>sent.push(structuredClone(mail))},error_:(status,message)=>{throw Object.assign(Error(message),{status});}});
 vm.runInContext(fs.readFileSync('backend/RosterEdgeMail.gs','utf8')+'\n'+source.slice(fn.start,fn.end),context);
 return request=>context.rosterServiceDispatch_(request);
}
async function fixture(){
 const db=database(),f=domain(),state=f.O.initial(),people=['one','two','three'].map(id=>({id,name:'Synthetic '+id,active:true,email:id+'@school.test',emails:[id+'@school.test'],groups:['Teaching'],role:'Teacher',employment:'Permanent'}));
 state.freshStart={effectiveDate:today};state.systemConfig.scheduledAllocationEnabled=false;state.systemConfig.driveBackup={enabled:false};state.systemConfig.driveDaily={enabled:false};
 state.massPublications[today]={at:iso};state.dailyEmploymentSettings={time:'08:00',subject:'Synthetic Daily Updates',recipients:people.map(p=>({staffId:p.id,emails:p.emails}))};
 const snapshot={date:today,capturedAt:iso,revision:1,health:{percentage:100},externalTeachers:[],absences:[{name:'Synthetic absence',reason:'Synthetic fixture reason',periods:[1]}],reliefTeachers:[]};state.dailyEmploymentSnapshots=[snapshot];
 const ctx={...f.ctx,now,iso,today,minute:485,people};assert.equal(f.O.queueDailyEmployment(state,ctx,today).dailyEmploymentMailQueued,true);assert(state.dailyEmploymentMail.every(r=>r.requestedBy==='scheduled'));
 const activate=async(scope,value)=>{const store=Store.open(db,scope),h=await store.importState({state:value,actor:'fixture',requestId:scope,source:{sourceDigest:'a'.repeat(64),manifestDigest:'b'.repeat(64)}});await store.transition({from:'imported',to:'active',expectedRevision:h.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:h.sourceDigest,verifiedRecords:h.importedRecords}});await db.prepare("UPDATE gsis_edge_heads SET metadata_json=json_set(metadata_json,'$.importSession',?) WHERE scope=?").bind('c'.repeat(64),scope).run();return store;};
 const store=await activate('roster',state);await activate('roster-register',{schema:1,revision:0,entries:[]});const refs=await activate('roster-references',{schema:1,contacts:{rosterPeople:people,rosterSMCIds:['one'],rosterAdminIds:['one']},contactsCheckedAt:now,calendarCheckedAt:now,calendarByDate:{[today]:{date:today,available:true,schoolDay:true,parity:'single'}}});
 await db.prepare("UPDATE gsis_edge_heads SET metadata_json=json_set(metadata_json,'$.freshStart',json(?)) WHERE scope IN ('roster','roster-register')").bind(JSON.stringify({sourceDigest:'d'.repeat(64),archiveId:'synthetic-archive',effectiveDate:today})).run();
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_AUTOMATION_ENABLED:'false',WHATSAPP_ENABLED:'false',ROSTER_PUBLIC_ORIGIN:'https://roster.school.test',APPS_SCRIPT_URL:'https://script.google.com/macros/s/employment-fixture/exec',GSIS_SECRET:secret};
 const change=async fn=>{const before=await store.load(),after=structuredClone(before.state);fn(after);await store.commit({before:before.state,after,expectedRevision:before.revision,actor:'fixture',requestId:crypto.randomUUID(),digest:await Store.digest(after)});};
 return {db,env,store,refs,change,snapshot};
}
try{
 const f=await fixture(),sent=[],operations=[],transport=googleTransport(sent);
 globalThis.fetch=async(url,options)=>{assert.equal(new URL(url).hostname,'script.google.com');const envelope=JSON.parse(options.body);assert.equal(envelope.signature,createHmac('sha256',secret).update(envelope.payload).digest('hex'));const request=JSON.parse(envelope.payload);operations.push(request.input.operation);assert.equal(request.action,'rosterService');assert.equal(request.input.operation,'sendEdgeMail');return Response.json({ok:true,data:transport(request)});};
 // The same source as the real scheduled producer queued these rows. No Pages
 // request is needed: the real notification minute cron must drain them.
 const tasks=[];await worker.scheduled({cron:'* * * * *',scheduledTime:now},f.env,{waitUntil:p=>tasks.push(p)});await Promise.all(tasks);
 assert.equal(sent.length,3,'cron drains all three scheduled recipients without a Pages request');assert.equal(new Set(sent.map(m=>m.to)).size,3);for(const mail of sent){assert.equal(mail.subject,'Synthetic Daily Updates | '+today);assert(mail.body.includes('Synthetic fixture reason'));assert(mail.htmlBody.includes('Synthetic fixture reason'));}
 assert((await f.store.load()).state.dailyEmploymentMail.every(r=>r.status==='sent'));assert.equal(f.db.sql.prepare("SELECT status FROM gsis_job_health WHERE job='employment-mail'").get().status,'success');
 await dispatchDailyEmploymentReports(f.env);assert.equal(sent.length,3,'a later Pages accelerator does not resend');
 const health=await readSystemHealth(f.env,{jobsOnly:true,now});assert.deepEqual(health.employmentMail,{available:true,lastSentAt:now,failed:0,uncertain:0,issues:[]});
 for(const tick of [now+60000,now+120000]){Date.now=()=>tick;const beforeRefs=await f.refs.load();await f.refs.commit({before:beforeRefs.state,after:{...beforeRefs.state,contactsCheckedAt:tick,calendarCheckedAt:tick},expectedRevision:beforeRefs.revision,actor:'fixture',requestId:crypto.randomUUID(),digest:'e'.repeat(64)});const idle=[];await worker.scheduled({cron:'* * * * *',scheduledTime:tick},f.env,{waitUntil:p=>idle.push(p)});await Promise.all(idle);assert.equal(f.db.sql.prepare("SELECT event_at FROM gsis_job_health WHERE job='employment-mail'").get().event_at,tick,'each drain refreshes its health record');}Date.now=()=>now;
 assert.equal((await readSystemHealth(f.env,{jobsOnly:true,now})).employmentMail.lastSentAt,now,'idle health beats never become fake send times');

 const history=await fixture();await history.change(s=>{for(let n=0;n<12;n++)s.dailyEmploymentMail.push({id:'stale-'+n,key:'stale-'+n,date:'2026-11-12',to:'one@school.test',subject:'Old report',status:'queued'});});
 const historySent=sent.length,historyResult=await dispatchDailyEmploymentReports(history.env);assert.equal(historyResult.cancelled,12);assert.equal(historyResult.sent,3);assert.equal(sent.length-historySent,3,'current reports send while the stale backlog is cancelled');
 const historyRows=(await history.store.load()).state.dailyEmploymentMail;assert.equal(historyRows.length,15);assert(historyRows.filter(r=>r.id.startsWith('stale-')).every(r=>r.status==='cancelled'));await dispatchDailyEmploymentReports(history.env);assert.equal(sent.length-historySent,3);
 // Past backlog is cancelled once, future mail waits, missing snapshots fail,
 // and ten-minute expired claims become uncertain without a provider call.
 const backlog=await fixture();await backlog.change(s=>{s.dailyEmploymentMail=s.dailyEmploymentMail.slice(0,1);for(let n=0;n<12;n++)s.dailyEmploymentMail.push({id:'old-'+n,key:'automatic:old-'+n,date:'2026-11-12',to:'one@school.test',subject:'Old',status:'queued'});s.dailyEmploymentMail.push({id:'future',key:'future',date:'2026-11-14',to:'one@school.test',subject:'Future',status:'queued'},{id:'missing',key:'missing',date:today,to:'one@school.test',subject:'Missing',status:'queued'},{id:'expired',key:'expired',date:today,to:'one@school.test',subject:'Expired',status:'sending',claimId:crypto.randomUUID(),claimedAt:new Date(now-601000).toISOString()});s.dailyEmploymentSnapshots=[];});
 const before=sent.length,result=await dispatchDailyEmploymentReports(backlog.env);assert.equal(result.cancelled,12);assert.equal(result.failed,2);assert.equal(result.uncertain,1);assert.equal(sent.length,before);
 const rows=(await backlog.store.load()).state.dailyEmploymentMail;assert.equal(rows.length,16);assert(rows.filter(r=>r.id.startsWith('old-')).every(r=>r.status==='cancelled'&&r.error==='STALE_BACKLOG: date passed before D1 dispatch was fixed'));assert.equal(rows.find(r=>r.id==='future').status,'queued');assert.equal(rows.find(r=>r.id==='missing').status,'failed');assert.match(rows.find(r=>r.id==='missing').error,/snapshot/);assert.equal(rows.find(r=>r.id==='expired').status,'uncertain');
 const revision=(await backlog.store.head()).revision;await dispatchDailyEmploymentReports(backlog.env);assert.equal(sent.length,before);assert.equal((await backlog.store.head()).revision,revision,'second maintenance pass is a no-op');
 const retained=await readSystemHealth(backlog.env,{jobsOnly:true,now});assert.equal(retained.employmentMail.failed,2);assert.equal(retained.employmentMail.uncertain,1);
 const idleTasks=[];await worker.scheduled({cron:'* * * * *',scheduledTime:now},backlog.env,{waitUntil:p=>idleTasks.push(p)});await Promise.all(idleTasks);
 const uiHealth=await readSystemHealth(backlog.env,{jobsOnly:true,now}),{JSDOM}=require('jsdom');
 const dom=new JSDOM(fs.readFileSync('roster-update/public/system-health.html','utf8'),{url:'https://school.test/system-health.html',runScripts:'outside-only'});dom.window.fetch=async path=>({ok:true,json:async()=>({ok:true,data:path==='/api/operations'?{alerts:[],migrationNeeded:0}:uiHealth})});vm.runInContext(fs.readFileSync('roster-update/public/system-health.js','utf8'),dom.getInternalVMContext());await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));const shown=dom.window.document.querySelector('#jobs-body').textContent;assert.match(shown,/Employment email/);assert.match(shown,/Last sent/);assert.match(shown,/2 failed · 1 uncertain/);assert.match(shown,/original report snapshot is unavailable/);assert.match(shown,/Email acceptance was not confirmed/);dom.window.close();

 // Race Pages with cron at the actual provider boundary. Claims remain in D1.
 const race=await fixture();let release,entered;const gate=new Promise(r=>release=r),inside=new Promise(r=>entered=r);let pause=true;
 globalThis.fetch=async(url,options)=>{const request=JSON.parse(JSON.parse(options.body).payload);assert.equal(request.input.operation,'sendEdgeMail');if(pause){pause=false;entered();await gate;}return Response.json({ok:true,data:transport(request)});};
 const page=dispatchDailyEmploymentReports(race.env);await inside;const cron=[];await worker.scheduled({cron:'* * * * *',scheduledTime:now},race.env,{waitUntil:p=>cron.push(p)});await Promise.all(cron);release();await page;
 assert.equal(sent.length-before,3);assert((await race.store.load()).state.dailyEmploymentMail.every(r=>r.status==='sent'));assert.equal(new Set(operations).size,1);
 const ambiguous=await fixture();await ambiguous.change(s=>s.dailyEmploymentMail=s.dailyEmploymentMail.slice(0,1));let ambiguousCalls=0;globalThis.fetch=async()=>{ambiguousCalls++;throw Error('synthetic ambiguous timeout');};
 assert.equal((await dispatchDailyEmploymentReports(ambiguous.env)).uncertain,1);await dispatchDailyEmploymentReports(ambiguous.env);assert.equal(ambiguousCalls,1,'ambiguous provider response is never automatically resent');
 const duplicate=await fixture();await duplicate.change(s=>s.dailyEmploymentMail.push({...s.dailyEmploymentMail[0],id:'duplicate-identity'}));const duplicateStart=sent.length;globalThis.fetch=async(url,options)=>Response.json({ok:true,data:transport(JSON.parse(JSON.parse(options.body).payload))});const dedup=await dispatchDailyEmploymentReports(duplicate.env);assert.equal(dedup.cancelled,1);assert.equal(sent.length-duplicateStart,3);
 const bounded=await fixture();await bounded.change(s=>{s.dailyEmploymentMail.push(...s.dailyEmploymentMail.map((r,n)=>({...r,id:'extra-'+n,key:'manual-extra-'+n})));});const capStart=sent.length;assert.equal((await dispatchDailyEmploymentReports(bounded.env)).sent,5);assert.equal(sent.length-capStart,5);assert.equal((await bounded.store.load()).state.dailyEmploymentMail.filter(r=>r.status==='queued').length,1);assert.equal((await dispatchDailyEmploymentReports(bounded.env)).sent,1);
 console.log('scheduled employment mail, frozen Google mail-only adapter, D1 snapshots, backlog, missing snapshot, expiry, health and Pages/cron race pass');
}finally{Date.now=previousNow;globalThis.fetch=previousFetch;}
