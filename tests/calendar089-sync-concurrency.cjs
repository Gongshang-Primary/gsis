'use strict';
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {makeHarness} = require('./calendar/backend_harness.cjs');
const {makeCalendarApiMock} = require('./calendar/calendar_api_mock.cjs');
const results = [];
function test(name, run) {
  try { run(); results.push({name, ok: true}); console.log('PASS', name); }
  catch (error) { results.push({name, ok: false}); console.error('FAIL', name, error.stack); }
}
function fixture() {
  const h = makeHarness(), api = makeCalendarApiMock();
  h.sandbox.Calendar = api.api;
  const calendarId = h.sandbox.setting_('STAFF_CALENDAR_ID');
  api.seedCalendar({id: calendarId});
  h.seed('LaneSchedule', h.sandbox.tableObjects_(h.sheets.get('Lanes')).flatMap(lane => h.sandbox.legacyLaneScheduleRows_(lane)));
  h.seed('Events', [{...h.base, StaffCalendarEventId: '', ParentCalendarEventId: '', StaffSyncHash: '', StaffSyncState: 'PENDING_SYNC'}]);
  const session = h.call('startSyncYear', {year: 2026, target: 'staff'});
  return {...h, api, calendarId, session};
}

test('Every Google Calendar call in a sync batch runs outside the Calendar write lock', () => {
  const h = fixture(); let calls = 0;
  h.api.setFault(stage => {
    if (stage !== 'before') return;
    calls++;
    assert.equal(h.sandbox.LockService.getScriptLock().hasLock(), false, 'External Calendar work must not hold the shared writer lock');
  });
  assert.equal(h.call('syncYearBatch', {syncRunId: h.session.syncRunId}).completed, true);
  assert(calls > 0); assert.equal(h.api.live(h.calendarId).length, 1);
});

test('An event edit during provider work stays pending and the next batch applies it without a duplicate event', () => {
  const h = fixture(); let edited = false;
  h.api.setFault((stage, call) => {
    if (stage !== 'after' || call.method !== 'Events.insert' || edited) return;
    edited = true;
    const event = h.event('E1');
    h.call('saveEvent', {event: {...event, StaffTitle: 'New title during sync'}, expectedRevision: event._revision, operationId: randomUUID()});
  });
  const first = h.call('syncYearBatch', {syncRunId: h.session.syncRunId});
  assert(edited); assert.equal(first.completed, false);
  assert.equal(h.event('E1').StaffTitle, 'New title during sync');
  assert.notEqual(h.event('E1').StaffSyncState, 'SYNCED', 'An old provider result must not acknowledge newer source content');
  h.api.setFault(null);
  h.advanceClock(60000);
  const second = h.call('syncYearBatch', {syncRunId: h.session.syncRunId});
  assert.equal(second.completed, true); assert.equal(h.api.live(h.calendarId).length, 1);
  assert.equal(h.api.live(h.calendarId)[0].summary, '[Mtg] New title during sync');
  assert.equal(h.event('E1').StaffSyncState, 'SYNCED');
});

test('An overlapping batch sees the durable claim and does not dispatch a second provider write', () => {
  const h = fixture(); let nested;
  h.api.setFault((stage, call) => {
    if (stage !== 'before' || call.method !== 'Events.insert' || nested) return;
    nested = h.call('syncYearBatch', {syncRunId: h.session.syncRunId});
    assert.equal(nested.inProgress, true); assert.equal(nested.completed, false);
  });
  assert.equal(h.call('syncYearBatch', {syncRunId: h.session.syncRunId}).completed, true);
  assert(nested); assert.equal(h.api.calls.filter(c => c.method === 'Events.insert').length, 1);
});

test('An expired claim resumes from durable provider identity after a lost source settlement', () => {
  const h = fixture(); let interrupted = false;
  h.setFault((stage, write) => {
    if (stage === 'before' && write.sheet === 'Events' && !interrupted) { interrupted = true; throw Error('Lost settlement response'); }
  });
  assert.throws(() => h.call('syncYearBatch', {syncRunId: h.session.syncRunId}));
  assert.equal(h.api.live(h.calendarId).length, 1);
  h.setFault(null);
  const session = h.sandbox.readCalendarSyncSession_();
  assert(session.claim, 'An unconfirmed settlement keeps its claim for recovery');
  session.claim.expiresAt = Date.now() - 1;
  h.sandbox.writeCalendarSyncSession_(session);
  assert.equal(h.call('syncYearBatch', {syncRunId: h.session.syncRunId}).completed, true);
  assert.equal(h.api.live(h.calendarId).length, 1);
  assert.equal(h.api.calls.filter(c => c.method === 'Events.insert').length, 1);
});

test('A lane change during sync cannot mark the old publication synced', () => {
  const h = fixture(); let changed = false;
  h.api.setFault((stage, call) => {
    if (stage !== 'after' || call.method !== 'Events.insert' || changed) return;
    changed = true;
    const sheet = h.sheets.get('Lanes'), col = sheet.values[0].indexOf('SyncToStaffCalendar');
    const row = sheet.values.find(row => row[0] === 'after_school'); row[col] = 'No';
  });
  const result = h.call('syncYearBatch', {syncRunId: h.session.syncRunId});
  assert.equal(result.completed, false); assert.notEqual(h.event('E1').StaffSyncState, 'SYNCED');
  h.api.setFault(null);
  h.advanceClock(60000);
  assert.equal(h.call('syncYearBatch', {syncRunId: h.session.syncRunId}).completed, true);
  assert.equal(h.api.live(h.calendarId).length, 0);
});

test('Background continuation resumes only existing jobs for an active Admin', () => {
  const h = fixture();
  h.props.set('CALENDAR_SERVICE_SECRET', 'background-secret');
  const wake = secret => JSON.parse(h.sandbox.doPost({postData: {contents: JSON.stringify({
    proxySecret: 'synthetic-secret', service: 'gsis-calendar-sync-worker-v1',
    calendarServiceSecret: secret, action: 'calendarSyncContinue', payload: {year: 2030, startedBy: 'someone-else'}
  })}}).text);
  assert.equal(wake('wrong').ok, false);
  assert.equal(h.api.live(h.calendarId).length, 0);
  const response = wake('background-secret');
  assert.equal(response.ok, true); assert.equal(response.result.completed, true);
  assert.equal(h.api.live(h.calendarId).length, 1);
  assert.equal(wake('background-secret').result.idle, true);
  assert.equal(h.api.calls.filter(c => c.method === 'Events.insert').length, 1);
});

test('A revoked Admin cannot be impersonated by a scheduled continuation', () => {
  const h = fixture();
  h.seed('Users', [{UserAlias: 'admin', Active: 'No', IsAdmin: 'No'}]);
  assert.throws(() => h.sandbox.apiContinueCalendarSync_(), error => error.status === 403);
  assert.equal(h.api.live(h.calendarId).length, 0);
});

test('Forced recovery does not clear a running batch claim', () => {
  const h = fixture(); let protectedClaim = false;
  h.api.setFault((stage, call) => {
    if (stage !== 'before' || call.method !== 'Events.insert' || protectedClaim) return;
    assert.throws(() => h.sandbox.forceClearCalendarSyncSession(), /still be running/);
    protectedClaim = true;
  });
  assert.equal(h.call('syncYearBatch', {syncRunId: h.session.syncRunId}).completed, true);
  assert(protectedClaim); assert.equal(h.api.live(h.calendarId).length, 1);
});

test('Settlement follows EventID after rows move while provider work is running', () => {
  const h = fixture(); let moved = false;
  h.api.setFault((stage, call) => {
    if (stage !== 'after' || call.method !== 'Events.insert' || moved) return;
    moved = true;
    const sheet = h.sheets.get('Events'), headers = sheet.values[0];
    const other = {...h.base, EventID: 'UNRELATED', StaffTitle: 'Keep this row'};
    sheet.values.splice(1, 0, headers.map(k => other[k] ?? ''));
  });
  assert.equal(h.call('syncYearBatch', {syncRunId: h.session.syncRunId}).completed, true);
  assert(moved); assert.equal(h.event('E1').StaffSyncState, 'SYNCED');
  assert.equal(h.event('UNRELATED').StaffCalendarEventId, h.base.StaffCalendarEventId);
  assert.equal(h.event('UNRELATED').StaffTitle, 'Keep this row');
});

console.log(JSON.stringify({passed: results.filter(r => r.ok).length, total: results.length}));
if (results.some(r => !r.ok)) process.exitCode = 1;
