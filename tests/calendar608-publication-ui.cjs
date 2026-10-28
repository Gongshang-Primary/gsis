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
    window.testCalendar = {state,renderDirtyPill,renderYearSelect,updateFreshnessUI,publishVersion,syncYear,bindStaticEvents,api};
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
  let f = fixture();
  const eligible = (events, laneEnabled = 'Yes') => {
    f.app.state.data.events = events;
    f.app.state.data.lanes[0].SyncToStaffCalendar = laneEnabled;
    f.app.renderDirtyPill();
    return !f.node('syncStaffBtn').disabled;
  };
  assert.equal(eligible([f.event()]), true, 'Published event can sync in unreleased year');
  assert.equal(eligible([f.event({StaffSyncState: 'SYNCED'})]), true, 'Old held SYNCED event without link becomes actionable');
  assert.equal(eligible([f.event({Status: 'HIDDEN'})]), false);
  assert.doesNotMatch(f.node('dirtyPill').textContent, /until release/);
  assert.equal(eligible([f.event()], 'No'), false, 'Column exclusion remains authoritative');
  assert.equal(eligible([f.event({DeletedAt: 'now', StaffCalendarEventId: 'linked', StaffSyncState: 'PENDING_REMOVAL'})]), true);
  assert.equal(eligible([f.event({DeletedAt: 'now', StaffSyncState: 'SYNCED'})]), false);
  assert.equal(f.node('publishVersionBtn').disabled, false, 'Publish remains available with no hidden events');
  f.app.state.data.actor.isAdmin = false;
  f.app.renderDirtyPill();
  assert.equal(f.node('publishVersionBtn').classList.contains('hidden'), true);
  await f.app.publishVersion();
  assert.equal(f.calls.length, 0);
  f.dom.window.close();

  f = fixture({confirm: false});
  await f.app.publishVersion();
  assert.equal(f.calls.length, 0, 'Cancel performs no request');
  f.dom.window.close();

  f = fixture();
  let release;
  f.handler((action, payload) => {
    if (action === 'publishVersion') return new Promise(resolve => { release = () => resolve({year: payload.year, published: 0, staffQueued: 1, ReleasedToTeachers: 'Yes'}); });
    if (action === 'startSyncYear') return {syncRunId: 'run1', completed: false, initialPending: 1};
    if (action === 'syncYearBatch') return {completed: true, writes: 1, processedTotal: 1, counts: {errors: []}};
    throw Error('Unexpected API');
  });
  const publishing = f.app.publishVersion();
  for (const id of ['publishVersionBtn','syncStaffBtn','syncParentBtn','yearSelect','refreshCalendarBtn']) assert.equal(f.node(id).disabled, true, id + ' locks during publication');
  await f.app.syncYear('parent');
  await f.app.publishVersion();
  assert.equal(f.calls.length, 1, 'Duplicate and Parent sync clicks cannot interleave');
  f.node('yearSelect').value = '2026';
  f.node('yearSelect').dispatchEvent(new f.w.Event('change'));
  assert.equal(f.app.state.year, 2027);
  assert.equal(f.node('yearSelect').value, '2027');
  await assert.rejects(f.app.api('saveYear', {Year: 2027}), /publication/);
  release();
  await publishing;
  assert.deepEqual(f.calls.map(c => c.action), ['publishVersion','bootstrap','startSyncYear','syncYearBatch','bootstrap']);
  assert.deepEqual(f.calls.find(c => c.action === 'startSyncYear').payload, {year: 2027, target: 'staff'});
  assert.match(f.prompts[0], /releases the year to teachers/);
  assert.match(f.prompts[0], /every live Hidden event in 2027/);
  assert.equal(f.app.state.calendarOperation, null);
  assert.equal(f.node('publishVersionBtn').disabled, false);
  assert.equal(f.w.sessionStorage.getItem(f.key), '[]', 'Confirmed publication clears pending identity');
  f.dom.window.close();

  f = fixture();
  f.handler(async () => { throw new Error('Network outcome unknown'); });
  await f.app.publishVersion();
  const firstId = f.calls[0].payload.operationId;
  const stored = f.w.sessionStorage.getItem(f.key);
  assert.match(stored, /admin\|2027/);
  assert.ok(stored.includes(firstId));
  assert.equal(f.calls.length, 1, 'No sync after unconfirmed publication');
  f.dom.window.close();
  f = fixture({stored});
  await f.app.publishVersion();
  assert.equal(f.calls[0].payload.operationId, firstId, 'Reload retry keeps operation identity');
  assert.match(f.prompts[0], /Retry the previous/);
  await f.app.publishVersion();
  const newRequest = f.calls.filter(c => c.action === 'publishVersion')[1];
  assert.notEqual(newRequest.payload.operationId, firstId, 'New confirmed publication uses fresh identity');
  f.dom.window.close();

  f = fixture();
  f.handler(async () => { const error = new Error('Fix calendar configuration'); error.definite = true; throw error; });
  await f.app.publishVersion();
  assert.equal(f.w.sessionStorage.getItem(f.key), '[]');
  assert.doesNotMatch(f.node('toast').textContent, /retry the same request/);
  f.dom.window.close();

  f = fixture();
  f.handler(async (action, payload) => {
    if (action === 'publishVersion') return {year: payload.year, published: 1, staffQueued: 1, ReleasedToTeachers: 'Yes'};
    throw new Error('Calendar temporarily unavailable');
  });
  await f.app.publishVersion();
  assert.match(f.node('toast').textContent, /2027 is published/);
  assert.match(f.node('toast').textContent, /Sync Staff is resumable/);
  assert.equal(f.node('syncStaffBtn').disabled, false);
  assert.equal(f.app.state.calendarOperation, null);
  f.dom.window.close();

  f = fixture({refreshError: true});
  await f.app.publishVersion();
  assert.deepEqual(f.calls.map(c => c.action), ['publishVersion','bootstrap']);
  assert.match(f.node('toast').textContent, /2027 is published. Staff sync did not start/);
  assert.equal(f.app.state.readOnly, true);
  f.dom.window.close();

  f = fixture();
  f.handler(async (action, payload) => {
    assert.equal(action, 'publishVersion');
    f.app.state.year = 2026;
    return {year: payload.year, published: 1, staffQueued: 1, ReleasedToTeachers: 'Yes'};
  });
  await f.app.publishVersion();
  assert.deepEqual(f.calls.map(c => c.action), ['publishVersion'], 'Stale selected year cannot start sync or overwrite another snapshot');
  assert.match(f.node('toast').textContent, /selected calendar changed/);
  f.dom.window.close();
  console.log('PASS Calendar publication UI: unreleased individual sync, historical states, roles, confirmation, year lock, ordered publish/refresh/batches, persisted retry identity, partial failure and stale-year protection');
})().catch(error => { console.error(error); process.exitCode = 1; });
