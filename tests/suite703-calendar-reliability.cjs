'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {JSDOM} = require(process.env.GSIS_TEST_JSDOM || 'jsdom');
const {makeHarness} = require('./calendar/backend_harness.cjs');

const release=require('../package.json'),calendarVersion=release.gsisComponentVersions?.calendarBackend||release.gsisRelease;
const html = fs.readFileSync('calendar-update/public/index.html', 'utf8');
const source = fs.readFileSync('calendar-update/public/app.js', 'utf8')
  .replace("document.addEventListener('DOMContentLoaded', init);", '')
  .replace(/\}\)\(\);\s*$/, `
    renderAll = () => {renderYearSelect(); updateFreshnessUI();};
    restoreRememberedView = () => {};
    rememberView = () => {};
    window.testCalendar = {state, loadBootstrap, requestRefresh};
  })();`);
const payload = year => ({version:calendarVersion,
  actor:{userAlias:'teacher',isAdmin:false,isParentPublisher:false},
  years:[2026,2027,2028].map(Year=>({Year,ReleasedToTeachers:'Yes'})), selectedYear:year,
  events:[], lanes:[], tags:[], yearStructure:[], dayNotes:[], colourRules:[]});

async function frontend() {
  const dom = new JSDOM(html,{url:'https://calendar.example/',runScripts:'outside-only'});
  const w = dom.window, requests = [];
  w.fetch = url => new Promise((resolve,reject) => requests.push({url,resolve:year=>resolve({ok:true,status:200,json:async()=>payload(year)}),reject}));
  vm.runInContext(source,dom.getInternalVMContext());
  const {state,loadBootstrap,requestRefresh} = w.testCalendar;
  Object.assign(state,{data:payload(2026),year:2026,page:'stats',readOnly:false});
  try {
    const first = loadBootstrap(2027);
    const duplicate = loadBootstrap(2027);
    assert.equal(requests.length,1,'Two same-year loads must share one request');
    await requestRefresh('return');
    assert.equal(requests.length,1,'Focus refresh must not restart the old year during a switch');
    requests[0].resolve(2027);
    assert.equal(await first,true); assert.equal(await duplicate,true);
    assert.equal(state.year,2027);
    const old = loadBootstrap(2026), next = loadBootstrap(2028);
    assert.equal(requests.length,3,'A different year starts its own request');
    requests[2].resolve(2028);assert.equal(await next,true);
    requests[1].resolve(2026);assert.equal(await old,false);
    assert.equal(state.year,2028,'Late old response cannot replace the selected year');
    const failed = loadBootstrap(2028);
    requests[3].reject(new Error('Synthetic network outage'));
    await assert.rejects(failed,/Synthetic network outage/);
    assert.equal(state.readOnly,true,'Failed refresh keeps the last view read-only');
    const retry = loadBootstrap(2028);
    assert.equal(requests.length,5,'Failure clears its flight so an explicit retry can run');
    requests[4].resolve(2028);assert.equal(await retry,true);
    console.log('PASS Calendar frontend: one request per active year, focus during switch, late response isolation, failure and retry');
  } finally { w.close(); }
}
function backend() {
  const counts = [];
  for (const cacheBroken of [false,true]) {
    const h=makeHarness();h.setCacheBroken(cacheBroken);
    h.sandbox.Sheets=new Proxy({}, {get(){throw Error('Advanced Sheets must not be used');}});
    const result=h.call('bootstrap',{year:2026});
    assert.equal(result.events.length,2);
    const cold=h.audit.nativeReads.slice(),body=cold.filter(row=>row.row>1);
    assert.equal(h.audit.apiReads.length,0);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,0);
    assert.equal(new Set(cold.map(row=>JSON.stringify(row))).size,cold.length,'Cold bootstrap must not repeat an identical native range');
    assert(body.some(row=>row.sheet==='Years')&&body.some(row=>row.sheet==='Users'),'authority is read from Google on every request');
    assert.deepEqual(body.filter(row=>row.sheet==='Events').map(({row,col,rows,cols})=>({row,col,rows,cols})),[{row:2,col:2,rows:3,cols:1},{row:2,col:1,rows:2,cols:31}],'event year index and selected-year rows only');
    counts.push({cacheBroken,requests:cold.length,cells:cold.reduce((n,r)=>n+r.rows*r.cols,0)});
    if(!cacheBroken) {
      const offset=h.audit.nativeReads.length;
      h.call('bootstrap',{year:2026});
      const warm=h.audit.nativeReads.slice(offset),warmBodies=warm.filter(row=>row.row>1);
      assert(warm.length<cold.length,'warm bootstrap skips cached configuration work');
      assert(warmBodies.some(row=>row.sheet==='Years')&&warmBodies.some(row=>row.sheet==='Users'),'warm authority remains fresh');
      assert(!warmBodies.some(row=>['Settings','Lanes','LaneSchedule','Tags','ColourRules'].includes(row.sheet)),'cached configuration does not reread its bodies');
    }
  }
  const h=makeHarness();
  assert.throws(()=>h.call('bootstrap',{year:2027},'teacher'),error=>error.status===403);
  assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,0);
  console.log('PASS Calendar backend: '+JSON.stringify(counts)+'; native selected-year reads, warm cache and fresh permission checks preserved');
}
function metadataWrites() {
  const lanePayload = h => {
    const lane=h.sandbox.tableObjects_(h.sheets.get('Lanes')).find(row=>row.LaneID==='after_school');
    return {...lane,Header:'Revised after-school',Schedule:h.sandbox.legacyLaneScheduleRows_(lane)};
  };
  const cases=[
    {action:'saveLane',payload:lanePayload,tables:['Lanes','LaneSchedule','AuditLog']},
    {action:'saveTag',payload:()=>({Tag:'Mtg',Meaning:'Revised meaning',Active:'Yes'}),tables:['Tags','AuditLog']},
    {action:'deleteTag',payload:()=>({Tag:'PSLE'}),tables:['Tags','AuditLog']}
  ];
  for(const entry of cases) {
    const h=makeHarness(),payload=entry.payload(h),before=new Map(entry.tables.map(name=>[name,JSON.stringify(h.sheets.get(name).values)]));
    const beforeTags=h.sandbox.tableObjects_(h.sheets.get('Tags')).map(row=>({...row}));
    let sorts=0;h.sandbox.sortGlossaryAlphabetically_=()=>{sorts++;};
    const nativePlan=h.sandbox.calendarNativeWritePlan_;
    h.sandbox.calendarNativeWritePlan_=(...args)=>{nativePlan(...args);throw Error('Synthetic native plan rejection');};
    assert.throws(()=>h.call(entry.action,payload),/Synthetic native plan rejection/);
    for(const [name,value] of before) assert.equal(JSON.stringify(h.sheets.get(name).values),value,entry.action+' must retain '+name+' when the native plan is rejected');
    assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,0);
    assert.equal(sorts,0,'No optional sort runs before the transaction commits');
    h.sandbox.calendarNativeWritePlan_=nativePlan;const offset=h.audit.nativeWrites.length;
    h.sandbox.sortGlossaryAlphabetically_=()=>{sorts++;};
    const saved=h.call(entry.action,payload);
    assert.equal(h.audit.apiWrites.length,0);
    const written=new Set(h.audit.nativeWrites.slice(offset).map(row=>row.sheet));
    for(const table of entry.tables)assert(written.has(table)||before.get(table)!==JSON.stringify(h.sheets.get(table).values),entry.action+' writes or deletes '+table+' through native Sheets');
    assert.equal(sorts,0,'Metadata writes must not reorder or rewrite independent glossary records');
    const afterTags=h.sandbox.tableObjects_(h.sheets.get('Tags'));
    for(const old of beforeTags.filter(row=>entry.action==='saveLane'||row.Tag!==payload.Tag)){
      const current=afterTags.find(row=>row.Tag===old.Tag);assert.deepEqual(JSON.parse(JSON.stringify(current)),old,'Independent glossary record remains unchanged');
      assert.equal(h.sandbox.calendarMetadataRevision_(current),h.sandbox.calendarMetadataRevision_(old),'Independent loaded glossary token remains valid');
    }
    const visible=h.sandbox.configCached_().tags,expected=afterTags.filter(row=>row.Active==='Yes').map(row=>row.Tag).sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
    assert.deepEqual(Array.from(visible,row=>row.Tag),Array.from(expected),'Visible glossary remains alphabetical without physical row sorting');
    if(entry.action==='saveTag'){
      const current=afterTags.find(row=>row.Tag===payload.Tag);assert.equal(current.Meaning,payload.Meaning);assert.equal(visible.find(row=>row.Tag===payload.Tag).Meaning,payload.Meaning);assert.equal(saved._metadataRevision,h.sandbox.calendarMetadataRevision_(current));
    }
    if(entry.action==='deleteTag')assert(!visible.some(row=>row.Tag===payload.Tag),'Deleted tag disappears from the visible catalogue');
  }
  const h=makeHarness();
  h.sandbox.configCached_();
  h.sandbox.sortGlossaryAlphabetically_=()=>{throw Error('Physical glossary sort must not run during a metadata save');};
  assert.equal(h.call('saveTag',{Tag:'Mtg',Meaning:'Saved primary value',Active:'Yes'}).Meaning,'Saved primary value');
  assert.equal(h.sandbox.findRowByKeyCaseInsensitive_(h.sheets.get('Tags'),'Tag','Mtg').object.Meaning,'Saved primary value');
  assert.equal(h.sandbox.configCached_().tags.find(row=>row.Tag==='Mtg').Meaning,'Saved primary value','Cached visible glossary reflects the acknowledged save');
  assert.equal(h.sheets.get('AuditLog').values[1][3],'UPDATE_TAG','Primary audit remains present');
  // Native coordinated writes are not a cross-sheet transaction. A failure at
  // the audit write must surface, while fresh reads reflect the committed tag.
  const partial=makeHarness();partial.sandbox.configCached_();
  const auditBefore=JSON.stringify(partial.sheets.get('AuditLog').values);
  partial.setFault((stage,row)=>{if(stage==='before'&&row.sheet==='AuditLog')throw Error('Synthetic native audit interruption');});
  assert.throws(()=>partial.call('saveTag',{Tag:'Mtg',Meaning:'Committed before audit interruption',Active:'Yes'}),/Synthetic native audit interruption/);
  partial.setFault(null);
  assert.equal(partial.sandbox.findRowByKeyCaseInsensitive_(partial.sheets.get('Tags'),'Tag','Mtg').object.Meaning,'Committed before audit interruption');
  assert.equal(partial.sandbox.configCached_().tags.find(row=>row.Tag==='Mtg').Meaning,'Committed before audit interruption','cache invalidates after a partially committed native attempt');
  assert.equal(JSON.stringify(partial.sheets.get('AuditLog').values),auditBefore,'an interrupted audit must not be fabricated');
  assert.equal(partial.audit.apiWrites.length,0);assert.equal(partial.sandbox.rc18IO_().queue,null);
  console.log('PASS Calendar metadata: coordinated native lane/tag/audit writes, unchanged state on prevalidation rejection, honest partial-write recovery, alphabetical visible glossary, independent record/token preservation and saved-cache refresh');
}
function metadataCacheRaces() {
  const cases=[
    {action:'saveLane',payload:h=>{
      const lane=h.sandbox.tableObjects_(h.sheets.get('Lanes')).find(row=>row.LaneID==='after_school');
      return {...lane,Header:'New lane header',Schedule:h.sandbox.legacyLaneScheduleRows_(lane)};
    },read:r=>r.configCached_().lanes.find(row=>row.LaneID==='after_school').Header,expected:'New lane header'},
    {action:'saveColourRule',payload:()=>({RuleID:'R1',RuleType:'TITLE_CONTAINS',Value:'New title',FillColour:'#123456'}),
      read:r=>r.configCached_().colourRules.find(row=>row.RuleID==='R1').Value,expected:'New title'},
    {action:'deleteColourRule',payload:()=>({RuleID:'R1'}),
      read:r=>r.configCached_().colourRules.find(row=>row.RuleID==='R1')?.Value,expected:undefined},
    {action:'saveUser',payload:()=>({UserAlias:'admin',DisplayName:'New display name',IsAdmin:'Yes',IsParentPublisher:'Yes',Active:'Yes'}),
      read:r=>r.userRowsCached_().find(row=>row.UserAlias==='admin').DisplayName,expected:'New display name'},
    {action:'saveUrls',payload:()=>({staffCalendarUrl:'https://calendar.google.com/calendar/u/0?cid='+Buffer.from('new-staff@group.calendar.google.com').toString('base64url'),parentCalendarUrl:'https://calendar.google.com/calendar/u/0?cid='+Buffer.from('new-parent@group.calendar.google.com').toString('base64url')}),
      read:r=>r.settingsMapCached_().STAFF_CALENDAR_ID,expected:'new-staff@group.calendar.google.com'},
    {action:'saveTag',payload:()=>({Tag:'Mtg',Meaning:'New tag meaning',Active:'Yes'}),
      read:r=>r.configCached_().tags.find(row=>row.Tag==='Mtg').Meaning,expected:'New tag meaning'},
    {action:'deleteTag',payload:()=>({Tag:'PSLE'}),
      read:r=>r.configCached_().tags.find(row=>row.Tag==='PSLE')?.Meaning,expected:undefined}
  ];
  for(const entry of cases)for(const outcome of ['committed','responseLost','rejected']) {
    const h=makeHarness(),reader=makeHarness();
    h.seed('ColourRules',[{RuleID:'R1',RuleType:'TITLE_CONTAINS',Value:'Old title',FillColour:'#123456',Active:'Yes'}]);
    h.sandbox.sortGlossaryAlphabetically_=()=>{};
    h.sandbox.Utilities.base64DecodeWebSafe=value=>Array.from(Buffer.from(value,'base64url'));
    h.sandbox.Utilities.newBlob=bytes=>({getDataAsString:()=>Buffer.from(bytes).toString('utf8')});
    reader.sandbox.SpreadsheetApp.getActiveSpreadsheet=()=>h.ss;
    reader.sandbox.Sheets=h.sandbox.Sheets;
    reader.sandbox.CacheService=h.sandbox.CacheService;
    const read=()=>{reader.sandbox.rc18ResetIO_();return entry.read(reader.sandbox);};
    const old=read(),payload=entry.payload(h);
    let observed=false;
    const nativeWrite=h.sandbox.rc18WriteRequests_;
    h.sandbox.rc18WriteRequests_=requests=>{
      if(!observed) {
        observed=true;assert.equal(read(),old,'Concurrent reader still sees the old committed workbook before the batch');
        if(outcome==='rejected')throw Error('Synthetic batch rejection');
      }
      return nativeWrite(requests);
    };
    h.setFault(stage=>{if(stage==='flush'&&outcome==='responseLost')throw Error('Synthetic lost acknowledgement');});
    if(outcome==='committed')h.call(entry.action,payload);
    else assert.throws(()=>h.call(entry.action,payload),/Synthetic/);
    h.setFault(null);
    assert(observed,'The second harness must read during the writer transaction');
    assert.equal(read(),outcome==='rejected'?old:entry.expected,entry.action+' cache must match the final authoritative workbook after '+outcome);
    assert.equal(h.sandbox.rc18IO_().queue,null,'Atomic queue is restored before another operation');
  }
  const h=makeHarness(),cacheService=h.sandbox.CacheService;
  let removed=0;
  h.sandbox.CacheService={getScriptCache:()=>{const cache=cacheService.getScriptCache();return {...cache,removeAll:keys=>{
    assert.equal(h.sandbox.rc18IO_().queue,null,'Shared cache is invalidated only after the queue is restored');removed++;cache.removeAll(keys);
  }};}};
  h.sandbox.rc18Atomic_(()=>h.sandbox.rc18Atomic_(()=>{
    h.sandbox.rc18Patch_(h.sheets.get('Tags'),2,{Meaning:'Nested atomic value'});
    h.sandbox.invalidateCalendarCaches_();
    assert.equal(removed,0,'Nested invalidation waits for its outer commit');
  }));
  assert.equal(removed,1,'One invalidation follows the outer transaction');
  assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,1);
  console.log('PASS Calendar cache races: independent concurrent reader, committed/lost/rejected transactions, nested queue and post-commit invalidation for lane, rule, user, URL and tag edits');
}
(async()=>{await frontend();backend();metadataWrites();metadataCacheRaces();})().catch(error=>{console.error(error);process.exitCode=1;});
