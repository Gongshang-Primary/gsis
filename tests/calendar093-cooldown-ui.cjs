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

(async () => {
  for (const kind of ['sync', 'wipe', 'skewed']) {
    const f = fixture(), waits = [], stages = [];
    const future = Date.now() + 120000;
    if (kind === 'skewed') f.w.Date.now = () => future + 3600000;
    f.w.setTimeout = (callback, delay) => {
      if (delay >= 119000 && delay <= 121000) {waits.push(delay); stages.push(f.node('syncStage').textContent + ' ' + f.node('syncDetail').textContent); return setTimeout(callback, 0);}
      if (delay < 1000) return setTimeout(callback, 0);
      return 0;
    };
    let batchCalls = 0;
    const session = {syncRunId: 'cool', wipeId: 'wipe', target: 'staff', completed: false, initialPending: 4, initialCount: 4, processedTotal: 2, deletedTotal: 2, remaining: 2, paused: true, pauseReason: 'RATE_LIMIT', retryAfterMs: 120000, nextAttemptEpochMs: future};
    f.handler(async action => {
      if (action === 'startSyncYear') return session;
      if (action === 'syncYearBatch' || action === 'calendarWipeBatch') {
        batchCalls++; assert.equal(waits.length, 1, 'No continuation request before the saved cooldown');
        return {completed: true, processedTotal: 4, deletedTotal: 4, remaining: 0, counts: {errors: []}};
      }
      throw Error(action);
    });
    if (kind !== 'wipe') await f.app.syncYear('staff'); else await f.app.runCalendarWipeBatches(session);
    assert.equal(batchCalls, 1); assert.equal(waits.length, 1); assert(waits[0] >= 119000);
    assert.match(stages[0], /Paused by Google Calendar/); assert.match(stages[0], /Singapore/);
    assert.match(stages[0], /2.*completed.*2.*remaining/);
    f.dom.window.close();
  }
  const f = fixture();
  f.handler(async action => {
    assert.equal(action, 'startSyncYear');
    return {syncRunId: 'daily', completed: false, paused: true, manualReview: true, pauseReason: 'DAILY_QUOTA', initialPending: 1, remaining: 1};
  });
  await f.app.syncYear('staff');
  assert.equal(f.calls.filter(c => c.action === 'syncYearBatch').length, 0);
  assert.match(f.node('toast').textContent, /daily quota|review/i);
  f.dom.window.close();
  console.log('Calendar cooldown UI: sync/wipe wait until deadline, Singapore time and counts, manual review stops.');
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
