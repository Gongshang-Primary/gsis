const assert = require('node:assert/strict');
const {harness, request, plain} = require('./backend_harness.cjs');
const {fixture} = require('./run_gsis_bridge_checks.cjs');
const results = [];
function test(name, fn) {
  try { fn(); results.push({name, ok:true}); }
  catch (e) { results.push({name, ok:false}); console.error('FAIL '+name+'\n'+e.stack); }
}
function dailyTriggers(h) {
  const api = h.ctx.ScriptApp;
  api.newTrigger = handler => {
    const t = {handler, getHandlerFunction:()=>handler}, builder = {};
    for (const key of ['atHour','nearMinute','everyDays','inTimezone','everyMinutes']) builder[key] = value => { t[key] = value; return builder; };
    builder.timeBased = () => builder;
    builder.create = () => { h.triggers.push(t); return t; };
    return builder;
  };
}
function configured(h, teacher = false) {
  Object.assign(h.properties, {LORD_WA_ENABLED:'true', LORD_WA_TEACHER_ENABLED:String(teacher), LORD_WA_ACCESS_TOKEN:'fixture', LORD_WA_PHONE_NUMBER_ID:'123', LORD_WA_API_VERSION:'v99.0', LORD_WA_LORD_BASE_URL:'https://lord.example.test/'});
  h.ctx.enableLORDSchoolWhatsAppAgreement(); h.reset();
}
function task(h, teacher = false) {
  const key = h.ctx.LORD_SECONDARY.PREFIX+'daily-sync-'+teacher;
  const row = Array(h.ctx.BOOKING_HEADERS.length).fill('');
  Object.assign(row, {0:'booking-fixture',1:'BOOKED',2:'Current Staff',6:new h.Clock(h.now),25:'staff@gsps.edu.sg'});
  if (teacher) {
    h.ctx.findBookingRow_ = () => ({values:row});
    h.ctx.teacherMessageEligible_ = () => true;
    h.ctx.teacherMessageValues_ = () => ['Fixture'];
  }
  h.properties[key] = JSON.stringify({kind:'whatsapp_alert',createdAt:h.now,payload:{audience:teacher?'teacher':'admin',templateKind:teacher?'bookingSuccess':'forceClose',bookingId:row[0],ownerEmail:row[25],remaining:[teacher?'staff@gsps.edu.sg':'admin@gsps.edu.sg'],values:['1']}});
  return key;
}
function queueTiming() {
  const source = process.env.LORD_TIMING_BASELINE ? require('fs').readFileSync(process.env.LORD_TIMING_BASELINE,'utf8') : undefined;
  const h = harness(source ? {source} : {}), c = h.ctx;
  configured(h,true);
  for (let i=0;i<500;i++) h.sheets.Bookings.data.push(Object.assign(Array(c.BOOKING_HEADERS.length).fill(''),{0:'old-'+i,1:'CANCELLED'}));
  const sheet = h.sheets.Bookings, getRange = sheet.getRange.bind(sheet);
  let scanLocked = false;
  sheet.getRange = (...args) => {
    const range = getRange(...args), read = range.getValues;
    range.getValues = () => { if (args[2] >= 500 && args[3] > 1) { scanLocked ||= h.locked; h.now += 45000; } return read(); };
    return range;
  };
  for (const key of ['getProperty','getProperties','setProperty','deleteProperty']) { const call=h.props[key]; h.props[key]=(...args)=>{h.now+=2;return call(...args);}; }
  for(let i=0;i<159;i++) h.properties[c.LORD_SECONDARY.PREFIX+'timing-'+i]=JSON.stringify({kind:i===158?'event':'whatsapp_alert',createdAt:h.now,payload:i===158?{eventType:'TIMING_AUDIT',sessionId:'',teacher:'',payload:{}}:i<29?{deliveryPending:{email:'fixture@gsps.edu.sg',startedAt:h.now},remaining:['fixture@gsps.edu.sg']}:{remaining:['fixture@gsps.edu.sg']},nextAttemptAt:i>=29&&i<158?h.now+60000:0});
  const native = c.LockService.getScriptLock, holds = [];
  c.LockService.getScriptLock = () => {
    const lock = native(); let started;
    return {hasLock:lock.hasLock, waitLock(ms){lock.waitLock(ms);started=h.now;},tryLock(ms){const ok=lock.tryLock(ms);if(ok)started=h.now;return ok;},releaseLock(){holds.push(h.now-started);lock.releaseLock();}};
  };
  c.processSecondaryQueue_(1);
  const report = {bookings:500,queuedTasks:159,uncertainTasks:29,scanLocked,lockHeldMs:holds.reduce((a,b)=>a+b,0),maxLockHeldMs:Math.max(...holds),timing: h.logs.map(s=>{try{return JSON.parse(s);}catch{return {};}}).filter(r=>r.event==='LORD_TIMING'&&r.action==='secondaryqueue')};
  console.log('QUEUE_TIMING '+JSON.stringify(report));
  return report;
}
if (process.env.LORD_QUEUE_TIMING_ONLY === '1') { queueTiming(); process.exit(0); }
test('Installer removes minute and duplicate sync triggers and keeps unrelated triggers', () => {
  const h=harness(); dailyTriggers(h); h.triggers=[{getHandlerFunction:()=> 'syncLORDGSiSReferences'},{getHandlerFunction:()=> 'syncLORDGSiSReferences'},{getHandlerFunction:()=> 'other'}];
  h.ctx.installLORDDailyContactsSync(); h.ctx.installLORDDailyContactsSync();
  const triggers=h.triggers.filter(t=>t.handler==='syncLORDGSiSReferences');
  assert.equal(triggers.length,1); assert.deepEqual({...triggers[0],getHandlerFunction:null},{handler:'syncLORDGSiSReferences',getHandlerFunction:null,atHour:2,nearMinute:3,everyDays:1,inTimezone:'Asia/Singapore'}); assert(h.triggers.some(t=>t.getHandlerFunction()==='other'));
});
test('Enabling the bridge also installs the daily trigger', () => { const h=fixture();dailyTriggers(h);h.ctx.enableLORDGSiSBridge();assert.equal(h.triggers[0].everyDays,1);assert(!h.triggers[0].everyMinutes); });
test('Scheduled sync waits 30 seconds and retries a deferred lock', () => {
  const h=fixture();h.enable();h.reset();let waits=[],failures=2;
  const original=h.ctx.LockService.getScriptLock;
  h.ctx.LockService.getScriptLock=()=>{const lock=original();return {...lock,tryLock(){throw Error('Scheduled sync must wait');},waitLock(ms){waits.push(ms);if(failures-->0)throw Error('Lock timeout');return lock.waitLock(ms);}};};
  h.ctx.Utilities.sleep=ms=>{h.now+=ms;};
  const result=h.ctx.syncLORDGSiSReferences();assert.equal(result.enabled,true);assert(waits.length>=3);assert(waits.every(ms=>ms===30000));
});
test('Busy retries are bounded and cannot renew freshness or steal another sync lease', () => {
  const h=fixture();h.enable();h.reset();const before=h.properties.LORD_GSIS_CHECK,lease=JSON.stringify({id:'other',expiresAt:h.now+120000});h.properties.LORD_GSIS_SYNC_LEASE=lease;let waits=0,sleeps=0;
  const original=h.ctx.LockService.getScriptLock;h.ctx.LockService.getScriptLock=()=>{const lock=original();return {...lock,waitLock(ms){waits++;return lock.waitLock(ms);}};};h.ctx.Utilities.sleep=()=>{sleeps++;};
  assert.equal(h.ctx.syncLORDGSiSReferences().code,'GSIS_SYNC_BUSY');assert.equal(waits,4);assert.equal(sleeps,3);assert.equal(h.properties.LORD_GSIS_CHECK,before);assert.equal(h.properties.LORD_GSIS_SYNC_LEASE,lease);
});
test('25 hour Contacts copy permits sending with no remote fetch; 27 hour copy syncs first', () => {
  const h=fixture();h.enable();h.now+=25*3600000;h.reset();h.ctx.gsisRequireFreshContacts_();assert.equal(h.remote.length,2);assert.equal(h.ctx.gsisSourceStatus_(h.ctx.gsisSnapshot_()).status,'healthy');
  h.now+=2*3600000;h.reset();h.ctx.gsisRequireFreshContacts_();assert.equal(h.remote.length,4);assert.equal(h.ctx.gsisSourceStatus_(h.ctx.gsisSnapshot_()).status,'healthy');
});
test('Failed stale recovery refuses once and preserves the last successful sync time', () => {
  const h=fixture();h.enable();const checked=JSON.parse(h.properties.LORD_GSIS_CHECK).contactsCheckedAt;h.now+=27*3600000;h.reset();h.failSource='contacts';
  assert.throws(()=>h.ctx.gsisRequireFreshContacts_());assert.equal(h.remote.length,3);assert.equal(JSON.parse(h.properties.LORD_GSIS_CHECK).contactsCheckedAt,checked);
  const reason=h.ctx.maintenanceFailureReason_(Object.assign(Error('PRIVATE'),{code:'GSIS_CONTACT_UNAVAILABLE'}));const detail=h.ctx.maintenanceFailurePublic_({kind:'whatsapp_retry',reason}).detail;assert.match(detail,/^Contacts copy not synced since \d\d:\d\d\. Use Sync Contacts now\.$/);assert(!detail.includes('PRIVATE'));
});
test('Every Contacts/sync code gets safe actionable text', () => {
  const h=fixture();h.enable();for(const code of ['GSIS_CONTACT_UNAVAILABLE','GSIS_SYNC_BUSY','GSIS_SYNC_DEFERRED','GSIS_SYNC_UNAVAILABLE','GSIS_SYNC_CHANGED']){
    const reason=h.ctx.maintenanceFailureReason_(Object.assign(Error('PRIVATE'),{code}));assert.equal(reason.code,code);assert.match(h.ctx.maintenanceFailurePublic_({kind:'whatsapp_retry',reason}).detail,/Use Sync Contacts now\./);
  }
});
test('Queue scans Bookings outside ScriptLock and logs measured lock time', () => {const timing=queueTiming();assert.equal(timing.scanLocked,false);assert(timing.maxLockHeldMs<1000);assert.equal(timing.timing.length,1);assert.equal(timing.timing[0].lockHeldMs,timing.lockHeldMs);});
test('Force-close recovery scans outside lock; concurrent insertion survives the enqueue recheck', () => {
  const h=harness(),c=h.ctx;configured(h);h.contacts.data[1][5]='91234567';h.reset();const intent={eventKey:'force:test',createdAt:h.now,values:['1','now','Cart']};h.sheets['Event Log'].data.push(['intent','','WHATSAPP_FORCE_CLOSE_PENDING',new h.Clock(),'SYSTEM',JSON.stringify(intent)]);
  const sheet=h.sheets['Event Log'],get=sheet.getRange.bind(sheet);sheet.getRange=(...args)=>{assert(!h.locked,'recovery scanned Event Log under lock');return get(...args);};
  const key=c.LORD_SECONDARY.PREFIX+'WA_'+c.hashBookingValue_(intent.eventKey,'');const existing=JSON.stringify({kind:'whatsapp_alert',createdAt:h.now,completedAt:h.now,payload:{remaining:[]}});
  const native=c.LockService.getScriptLock;c.LockService.getScriptLock=()=>{const lock=native();return {...lock,waitLock(ms){h.properties[key]=existing;return lock.waitLock(ms);}};};
  c.recoverWhatsAppForceClose_();assert.equal(h.properties[key],existing);
});
test('Teacher queue write rechecks a concurrent completion under its lock', () => {
  const h=harness(),c=h.ctx;configured(h,true);h.contacts.data[2][5]='98765432';assert(h.post(request({endPeriod:'4'})).ok);h.reset();const row=h.sheets.Bookings.data[1],key=c.LORD_SECONDARY.PREFIX+'WA_'+c.hashBookingValue_('teacher:bookingSuccess:'+row[0]+':created','');
  const existing=JSON.stringify({kind:'whatsapp_alert',createdAt:h.now,completedAt:h.now,payload:{remaining:[]}}),native=c.LockService.getScriptLock;
  c.LockService.getScriptLock=()=>{const lock=native();return {...lock,waitLock(ms){h.properties[key]=existing;return lock.waitLock(ms);}};};
  c.queueTeacherMessage_('bookingSuccess',row,h.now);assert.equal(h.properties[key],existing);
});
for(const teacher of [false,true]) test((teacher?'Teacher':'Admin')+' stale/config refusal stays retryable without a provider call', () => {
  const h=fixture();h.enable();configured(h,teacher);const key=task(h,teacher);h.now+=27*3600000;const saved=JSON.parse(h.properties[key]);saved.createdAt=h.now;h.properties[key]=JSON.stringify(saved);h.reset();h.failSource='contacts';let provider=0;const fetch=h.ctx.UrlFetchApp.fetch;h.ctx.UrlFetchApp.fetch=(url,options)=>{if(url.includes('graph.facebook.com')){provider++;throw Error('Unexpected provider call');}return fetch(url,options);};
  h.ctx.processSecondaryTaskWithClaim_(h.props,key);let current=JSON.parse(h.properties[key]);assert.equal(provider,0);assert(!current.payload.deliveryPending);assert(!current.leaseToken);assert.equal(h.ctx.backgroundTaskState_(current),'failed');assert(!h.ctx.getLORDMaintenanceStatus_().counts.uncertainTasks);
  h.properties.LORD_WA_ENABLED='false';h.now+=61000;h.reset();h.ctx.processSecondaryTaskWithClaim_(h.props,key);current=JSON.parse(h.properties[key]);assert(!current.payload.deliveryPending);assert.equal(h.ctx.backgroundTaskState_(current),'failed');assert.equal(provider,0);
});
for(const teacher of [false,true]) test((teacher?'Teacher':'Admin')+' final pre-provider refusal clears only this attempt checkpoint', () => {
  const h=fixture();h.enable();configured(h,teacher);const key=task(h,teacher),checkpoint=h.ctx.checkpointWhatsAppSend_;let refused=false,provider=0;
  h.ctx.checkpointWhatsAppSend_=(...args)=>{const out=checkpoint(...args);if(!args[2]){refused=true;h.properties.LORD_GSIS_ENABLED='false';}return out;};
  h.ctx.UrlFetchApp.fetch=()=>{provider++;throw Error('Must not call provider');};h.ctx.processSecondaryTaskWithClaim_(h.props,key);
  const current=JSON.parse(h.properties[key]);assert(refused);assert.equal(provider,0);assert(!current.payload.deliveryPending);assert.equal(h.ctx.backgroundTaskState_(current),'failed');
});
test('Provider timeout remains unknown and existing unknown tasks are never cleared or resent', () => {
  const h=fixture();h.enable();configured(h);const key=task(h);let calls=0;h.ctx.UrlFetchApp.fetch=()=>{calls++;throw Error('Provider timeout');};h.ctx.processSecondaryTaskWithClaim_(h.props,key);let current=JSON.parse(h.properties[key]);assert.equal(calls,1);assert(current.payload.deliveryPending);assert.equal(h.ctx.backgroundTaskState_(current),'unknown');h.now+=360001;h.reset();h.ctx.processSecondaryTaskWithClaim_(h.props,key);assert.equal(calls,1);assert(JSON.parse(h.properties[key]).payload.deliveryPending);
});
test('A temporarily busy sync lease is retried successfully inside the daily run', () => {
  const h=fixture();h.enable();h.properties.LORD_GSIS_SYNC_LEASE=JSON.stringify({id:'previous',expiresAt:h.now+10000});let sleeps=0;
  h.ctx.Utilities.sleep=()=>{sleeps++;delete h.properties.LORD_GSIS_SYNC_LEASE;};
  assert.equal(h.ctx.syncLORDGSiSReferences().enabled,true);assert.equal(sleeps,1);
});
for(const hours of [25,27]) test('Actual admin provider send at '+hours+' hours checks freshness before checkpoint', () => {
  const h=fixture();h.enable();configured(h);h.now+=hours*3600000;h.reset();const key=task(h),original=h.ctx.UrlFetchApp.fetch;let sends=0;
  h.ctx.UrlFetchApp.fetch=(url,options)=>{if(!url.includes('graph.facebook.com'))return original(url,options);assert(!h.locked);assert(h.ctx.gsisContactsFresh_(JSON.parse(h.properties.LORD_GSIS_CHECK),JSON.parse(h.properties.LORD_GSIS_SNAPSHOT).key));assert(JSON.parse(h.properties[key]).payload.deliveryPending);sends++;return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({messages:[{id:'fixture-accepted'}]})};};
  h.ctx.processSecondaryTaskWithClaim_(h.props,key);assert.equal(sends,1);assert.equal(h.remote.length,hours===25?2:4);assert(JSON.parse(h.properties[key]).completedAt);
});
test('Refreshed revocation or mobile change cannot send using the old resolved identity', () => {
  for(const update of [person=>{person.active=false;},person=>{person.mobile='6598765432';}]) {
    const h=fixture();h.enable();configured(h,true);const key=task(h,true);h.ctx.adminContacts_();h.source.contacts.people[0].active=true;update(h.source.contacts.people[0]);h.rekey();h.now+=27*3600000;let current=JSON.parse(h.properties[key]);current.createdAt=h.now;h.properties[key]=JSON.stringify(current);let calls=0;const fetch=h.ctx.UrlFetchApp.fetch;
    h.ctx.UrlFetchApp.fetch=(url,options)=>{if(url.includes('graph.facebook.com')){calls++;throw Error('Old identity sent');}return fetch(url,options);};
    h.ctx.processSecondaryTaskWithClaim_(h.props,key);current=JSON.parse(h.properties[key]);assert.equal(calls,0);assert(!current.payload.deliveryPending);assert.equal(h.ctx.backgroundTaskState_(current),'failed');
  }
});
test('Queue timing includes the admin provider-acceptance audit lock', () => {
  const h=fixture();h.enable();configured(h);const c=h.ctx,key=task(h);let sends=0;
  c.UrlFetchApp.fetch=()=>{sends++;return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({messages:[{id:'fixture-timing'}]})};};
  for(const name of ['getProperty','getProperties','setProperty','deleteProperty']){const call=h.props[name];h.props[name]=(...args)=>{h.now+=2;return call(...args);};}
  const flush=c.SpreadsheetApp.flush;c.SpreadsheetApp.flush=()=>{h.now+=1000;flush();};
  const native=c.LockService.getScriptLock,holds=[];
  c.LockService.getScriptLock=()=>{const lock=native();let started;return {hasLock:lock.hasLock,waitLock(ms){lock.waitLock(ms);started=h.now;},tryLock(ms){const ok=lock.tryLock(ms);if(ok)started=h.now;return ok;},releaseLock(){holds.push(h.now-started);lock.releaseLock();}};};
  c.processSecondaryQueue_(1);assert.equal(sends,1);assert(JSON.parse(h.properties[key]).completedAt);
  const timing=h.logs.map(s=>JSON.parse(s)).find(r=>r.event==='LORD_TIMING'&&r.action==='secondaryqueue');assert.equal(timing.lockHeldMs,holds.reduce((a,b)=>a+b,0));assert(timing.lockHeldMs>=1000);
});
test('Malformed Contacts metadata still records a retryable actionable failure', () => {
  const h=fixture();h.enable();configured(h);const key=task(h);h.properties.LORD_GSIS_CHECK='{';h.ctx.processSecondaryTaskWithClaim_(h.props,key);
  const current=JSON.parse(h.properties[key]);assert(!current.payload.deliveryPending);assert.equal(current.lastFailure.reason.code,'GSIS_SYNC_UNAVAILABLE');assert.equal(h.ctx.getLORDMaintenanceStatus_().counts.failedTasks,1);assert.match(h.ctx.getLORDMaintenanceStatus_().lastFailure.detail,/Contacts copy not synced since --:--. Use Sync Contacts now./);
  for(const raw of ['{','null','true','42','[]']){h.properties.LORD_GSIS_CHECK=raw;assert.doesNotThrow(()=>h.ctx.maintenanceFailureReason_(Object.assign(Error('PRIVATE'),{code:'GSIS_SYNC_UNAVAILABLE'})));}
});
console.log(JSON.stringify({passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,total:results.length}));
process.exitCode=results.some(r=>!r.ok)?1:0;
