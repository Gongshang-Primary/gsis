const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require(process.env.GSIS_TEST_JSDOM || 'jsdom');

const release=require('../package.json'),calendarVersion=release.gsisComponentVersions?.calendarBackend||release.gsisRelease;
const html = fs.readFileSync('calendar-update/public/index.html', 'utf8');
const source = fs.readFileSync('calendar-update/public/app.js', 'utf8')
  .replace("document.addEventListener('DOMContentLoaded', init);", '')
  .replace(/\}\)\(\);\s*$/, `
    renderAll = () => { renderYearSelect(); renderDirtyPill(); updateFreshnessUI(); };
    window.testCalendar = {state,renderDirtyPill,renderYearSelect,updateFreshnessUI,publishVersion,syncYear,bindStaticEvents,api,runCalendarWipeBatches};
  })();`);

function fixture(options = {}) {
  const dom = new JSDOM(html, {url: 'https://calendar.example/', runScripts: 'outside-only'});
  const w = dom.window;
  const key = 'gspsCalPublicationRequests';
  if (options.stored) w.sessionStorage.setItem(key, options.stored);
  const timers = w.setTimeout.bind(w);
  w.setTimeout = (callback, delay) => delay > 1000 ? 0 : timers(callback, 0);
  const prompts = [];
  w.confirm = message => { prompts.push(message); return options.confirm !== false; };
  const calls = [];
  const event = overrides => ({EventID: 'E1', Year: 2027, _revision: 'r1', Status: 'PUBLISHED', LaneID: 'day', StaffSyncState: 'PENDING_SYNC', ParentSyncState: 'SYNCED', ...overrides});
  let data = {
    version: calendarVersion, actor: {userAlias: 'admin', isAdmin: true}, selectedYear: 2027,
    years: [{Year: 2026, ReleasedToTeachers: 'Yes'}, {Year: 2027, ReleasedToTeachers: 'No'}],
    events: [event()], lanes: [{LaneID: 'day', SyncToStaffCalendar: 'Yes'}],
    pendingRemovals: [], tags: [], yearStructure: [], dayNotes: [], colourRules: []
  };
  let handler = async (action, payload) => {
    if (action === 'publishVersion') {
      data.years[1].ReleasedToTeachers = 'Yes';
      data.events.forEach(e => { if (!e.DeletedAt && e.Status === 'HIDDEN') e.Status = 'PUBLISHED'; });
      return {year: payload.year, published: 1, staffQueued: 1, ReleasedToTeachers: 'Yes'};
    }
    if (action === 'startSyncYear') return {syncRunId: 'run1', completed: false, initialPending: 1, remaining: 1};
    if (action === 'syncYearBatch') {
      data.events.forEach(e => { e.StaffSyncState = 'SYNCED'; e.StaffCalendarEventId = 'linked'; });
      return {completed: true, processedTotal: 1, remaining: 0, writes: 1, counts: {errors: []}};
    }
    throw new Error('Unexpected action ' + action);
  };
  w.fetch = async (url, opts = {}) => {
    if (String(url).startsWith('/api/bootstrap')) {
      calls.push({action: 'bootstrap', year: Number(new URL(url, 'https://calendar.example').searchParams.get('year'))});
      if (options.refreshError) throw new Error('Refresh failed');
      return {ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(data))};
    }
    const {action, payload} = JSON.parse(opts.body);
    calls.push({action, payload});
    const result = await handler(action, payload);
    return {ok: true, status: 200, json: async () => ({result})};
  };
  vm.runInContext(source, dom.getInternalVMContext());
  const app = w.testCalendar;
  Object.assign(app.state, {data: JSON.parse(JSON.stringify(data)), year: 2027, page: 'stats', readOnly: false});
  app.bindStaticEvents();
  const node = id => w.document.getElementById(id);
  return {dom, w, app, node, calls, prompts, event, data, key, handler: fn => { handler = fn; }};
}

(async()=>{
 for(const alreadyCompleted of [false,true]){const f=fixture(),responses=[];f.handler(async action=>{if(action==='startSyncYear')return {syncRunId:'blocked',completed:alreadyCompleted,initialPending:3,processedTotal:alreadyCompleted?2:0,remaining:1,blockedCount:1,blockedEvents:[{eventId:'E1',code:'PENDING_EVENT_WRITE'}],fullySynced:false,writes:2,counts:{errors:[]}};if(action==='syncYearBatch'){responses.push(action);return {syncRunId:'blocked',completed:true,fullySynced:false,completionState:'blocked',initialPending:3,processedTotal:2,remaining:1,blockedCount:1,blockedEvents:[{eventId:'E1',code:'PENDING_EVENT_WRITE'}],writes:2,counts:{errors:[]}};}throw Error(action);});await f.app.syncYear('staff');assert.equal(responses.length,alreadyCompleted?0:1,'completed processing does not loop or replay writes');assert.match(f.node('toast').textContent,/1 blocked/);assert.match(f.node('toast').textContent,/2 Calendar write/);assert.doesNotMatch(f.node('toast').textContent,/Nothing pending|sync complete/i);assert.doesNotMatch(f.node('syncStage').textContent,/whole-year sync complete/i);assert.match(f.node('syncDetail').textContent,/1 blocked/);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,alreadyCompleted?0:1);f.dom.window.close();}
 const f=fixture();f.handler(async action=>{if(action==='startSyncYear')return {syncRunId:'errors',completed:false,initialPending:2,remaining:2};if(action==='syncYearBatch')return {completed:true,fullySynced:false,completionState:'errors',processedTotal:2,remaining:0,writes:0,blockedCount:0,counts:{errors:[{eventId:'E1',error:'Saved diagnostic'},{eventId:'E2',error:'Saved diagnostic'}]}};throw Error(action);});await f.app.syncYear('staff');assert.match(f.node('toast').textContent,/2 errors/);assert.doesNotMatch(f.node('syncStage').textContent,/whole-year sync complete/i);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,1);f.dom.window.close();console.log('PASS O Calendar sync UI: blocked/failed partial outcomes stay honest, completed processing stops and exact counts remain visible');
})().catch(error=>{console.error(error.stack);process.exitCode=1});
