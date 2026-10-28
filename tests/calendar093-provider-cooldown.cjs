'use strict';
const assert = require('node:assert/strict');
const {makeHarness} = require('./calendar/backend_harness.cjs');
const {makeCalendarApiMock, apiError} = require('./calendar/calendar_api_mock.cjs');
let failures = 0;
const test = (name, run) => {try {run(); console.log('PASS', name);} catch (error) {failures++; console.error('FAIL', name, error.stack);}};
function fixture(count = 1) {
  const h = makeHarness(), api = makeCalendarApiMock();
  let now = Date.parse('2026-10-25T00:00:00Z');
  h.sandbox.Date = class extends Date {constructor(...args) {super(...(args.length ? args : [now]));} static now() {return now;}};
  h.sandbox.Math = Object.create(Math); h.sandbox.Math.random = () => 0;
  h.sandbox.Utilities.sleep = ms => {assert.equal(h.sandbox.LockService.getScriptLock().hasLock(), false); assert(ms < 60000, 'Cooldown must yield instead of sleeping'); now += ms;};
  h.sandbox.Calendar = api.api;
  const calendarId = h.sandbox.setting_('STAFF_CALENDAR_ID');
  api.seedCalendar({id: calendarId}); api.seedCalendar({id: h.sandbox.setting_('PARENT_CALENDAR_ID')});
  h.seed('LaneSchedule', h.sandbox.tableObjects_(h.sheets.get('Lanes')).flatMap(lane => h.sandbox.legacyLaneScheduleRows_(lane)));
  const rows = Array.from({length: count}, (_, i) => ({...h.base, EventID: 'E' + (i + 1), StaffCalendarEventId: '', ParentCalendarEventId: '', StaffSyncHash: '', StaffSyncState: 'PENDING_SYNC'}));
  h.seed('Events', rows);
  const start = () => h.call('startSyncYear', {year: 2026, target: 'staff'});
  return {...h, api, calendarId, rows, start, now: () => now, advance: ms => {now += ms;}, batch: id => h.call('syncYearBatch', {syncRunId: id})};
}
const writes = h => h.api.calls.filter(c => /Events\.(insert|update|remove)/.test(c.method));

test('The common provider path spaces creates, updates and removal by at least 500 ms', () => {
  const h = fixture(), stamps = [];
  h.api.setFault((stage, call) => {if (stage === 'before' && /Events\.(insert|update|remove)/.test(call.method)) {assert.equal(h.sandbox.LockService.getScriptLock().hasLock(), false); stamps.push(h.now());}});
  let event = h.rows[0];
  const sync = desired => {h.sandbox.rc18ResetIO_(); const r = h.sandbox.syncTarget_({id: h.calendarId}, 'staff', event, desired); event = {...event, ...r.patch};};
  sync(true); event.StaffTitle = 'Changed'; sync(true); sync(false);
  assert.equal(stamps.length, 3);
  assert(stamps[1] - stamps[0] >= 500); assert(stamps[2] - stamps[1] >= 500);
});

test('Mid-batch throttling checkpoints success, gates repeated clicks and a cold background resume, then recovers', () => {
  const h = fixture(3), started = h.start(); let attempts = 0;
  h.api.setFault((stage, call) => {if (stage === 'before' && call.method === 'Events.insert' && ++attempts === 2) {const error = apiError(429, 'rateLimitExceeded'); error.headers = {'Retry-After': '180'}; throw error;}});
  const first = h.batch(started.syncRunId);
  assert.equal(first.completed, false); assert.equal(first.processedTotal, 1); assert.equal(first.remaining, 2);
  assert.equal(first.pauseReason, 'RATE_LIMIT'); assert(first.nextAttemptEpochMs >= h.now() + 180000);
  assert.equal(h.event('E1').StaffSyncState, 'SYNCED'); assert.equal(h.event('E2').StaffSyncState, 'PENDING_SYNC');
  const calls = h.api.calls.length;
  assert.equal(h.batch(started.syncRunId).paused, true);
  assert.equal(h.start().syncRunId, started.syncRunId);
  h.sandbox.calendarProviderBatch_ = null; h.sandbox.calendarSyncClaim_ = null;
  assert.equal(h.sandbox.apiContinueCalendarSync_().state, 'paused');
  assert.equal(h.api.calls.length, calls, 'No provider reads or writes before the persisted deadline');
  h.advance(first.nextAttemptEpochMs - h.now()); h.api.setFault(null);
  assert.equal(h.batch(started.syncRunId).completed, true);
  assert.equal(h.api.live(h.calendarId).length, 3);
  assert.equal(new Set(writes(h).filter(c => c.method === 'Events.insert').map(c => c.id)).size, 3);
});

test('A lost create response followed by throttled recovery preserves its reserved ID on the next request', () => {
  const h = fixture(), started = h.start(); let committed = false;
  h.api.setFault((stage, call) => {
    if (stage === 'after' && call.method === 'Events.insert') {committed = true; throw apiError(503, 'backendError');}
    if (stage === 'before' && call.method === 'Events.get' && committed) throw apiError(429, 'rateLimitExceeded');
  });
  const first = h.batch(started.syncRunId); assert.equal(first.pauseReason, 'RATE_LIMIT'); assert.equal(h.api.live(h.calendarId).length, 1);
  h.advance(first.nextAttemptEpochMs - h.now()); h.api.setFault(null);
  assert.equal(h.batch(started.syncRunId).completed, true);
  assert.equal(writes(h).filter(c => c.method === 'Events.insert').length, 1);
});

test('403 quota reasons pause once, while permissions and long-term quotas require manual review', () => {
  for (const [reason, category, manual] of [['rateLimitExceeded', 'RATE_LIMIT', false], ['userRateLimitExceeded', 'RATE_LIMIT', false], ['forbidden', 'ACCESS_DENIED', true], ['dailyLimitExceeded', 'DAILY_QUOTA', true], ['quotaExceeded', 'CALENDAR_USAGE_LIMIT', true]]) {
    const h = fixture(), started = h.start();
    h.api.setFault((stage, call) => {if (stage === 'before' && call.method === 'Events.insert') throw apiError(403, reason);});
    const result = h.batch(started.syncRunId);
    assert.equal(result.pauseReason, category, reason); assert.equal(result.manualReview, manual, reason);
    assert.equal(writes(h).length, 1, reason);
    assert.equal(h.sandbox.apiContinueCalendarSync_().state, 'paused');
    assert.equal(writes(h).length, 1, reason);
  }
  const h = fixture();
  assert.equal(h.sandbox.calendarApiFailure_(new Error('Service invoked too many times for one day: calendar.')).reason, 'APPS_SCRIPT_QUOTA');
});

test('Repeated rate limits escalate across requests and stop automatic retries after the bounded limit', () => {
  const h = fixture(), started = h.start();
  h.api.setFault((stage, call) => {if (stage === 'before' && call.method === 'Events.insert') throw apiError(429, 'rateLimitExceeded');});
  let result;
  for (const seconds of [60, 120, 240, 480, 900, 900, 900, 900]) {
    result = h.batch(started.syncRunId);
    assert.equal(result.nextAttemptEpochMs - h.now(), seconds * 1000);
    h.advance(seconds * 1000);
  }
  assert.equal(result.manualReview, true);
  const before = writes(h).length;
  assert.equal(h.sandbox.apiContinueCalendarSync_().state, 'paused'); assert.equal(writes(h).length, before);
});

test('A successful sync batch yields briefly without incrementing quota escalation', () => {
  const h = fixture(6), started = h.start(), result = h.batch(started.syncRunId);
  assert.equal(result.remaining, 1); assert.equal(result.processedTotal, 5);
  assert.equal(result.nextAttemptEpochMs - h.now(), 1000);
  const before = h.api.calls.length; h.batch(started.syncRunId); assert.equal(h.api.calls.length, before);
  h.advance(1000); assert.equal(h.batch(started.syncRunId).completed, true);
});


test('Wipe deletion shares pacing and cooldown, releases the writer lock and cannot be duplicated by concurrent continuation', () => {
  const h = fixture();
  h.sandbox.CalendarApp = {getCalendarById() {assert.equal(h.sandbox.LockService.getScriptLock().hasLock(), false, 'Wipe provider calls must run unlocked'); return {getEvents: () => []};}};
  for (let i = 1; i <= 3; i++) h.api.seedEvent(h.calendarId, {id: 'wipe' + i, start: {date: '2026-09-14'}, end: {date: '2026-09-15'}});
  h.sandbox.writeCalendarWipeSession_({wipeId: 'WIPE-TEST', target: 'staff', year: 2026, calendarId: h.calendarId, startDate: '2026-01-01', endDate: '2026-12-31', initialCount: 3, deletedTotal: 0, startedBy: 'admin'});
  let calls = 0, nested;
  h.api.setFault((stage, call) => {
    if (stage !== 'before') return;
    assert.equal(h.sandbox.LockService.getScriptLock().hasLock(), false);
    if (call.method === 'Events.remove' && ++calls === 1) nested = h.call('calendarWipeBatch', {wipeId: 'WIPE-TEST'});
    if (call.method === 'Events.remove' && calls === 2) throw apiError(429, 'rateLimitExceeded');
  });
  const first = h.call('calendarWipeBatch', {wipeId: 'WIPE-TEST'});
  assert.equal(nested.inProgress, true); assert.equal(first.deletedTotal, 1); assert.equal(first.remaining, 2); assert.equal(first.pauseReason, 'RATE_LIMIT');
  const before = h.api.calls.length;
  h.call('calendarWipeBatch', {wipeId: 'WIPE-TEST'}); assert.equal(h.api.calls.length, before);
  h.advance(first.nextAttemptEpochMs - h.now()); h.api.setFault(null);
  const done = h.call('calendarWipeBatch', {wipeId: 'WIPE-TEST'});
  assert.equal(done.completed, true); assert.equal(done.deletedTotal, 3); assert.equal(h.api.live(h.calendarId).length, 0);
});

test('The shared provider attempt budget counts retries and yields before write 21', () => {
  const h = fixture(); h.sandbox.calendarProviderBatch_ = {attempts: 0};
  for (let i = 0; i < 20; i++) h.sandbox.calendarApiCall_('insert', 'staff', 'budget', () => true, false, 1, h.calendarId);
  let extra = false;
  assert.throws(() => h.sandbox.calendarApiCall_('update', 'staff', 'budget', () => {extra = true;}, false, 2, h.calendarId), error => error.calendarDeferred);
  assert.equal(extra, false); assert.equal(h.sandbox.calendarProviderBatch_.attempts, 20);
});


test('Account cooldown blocks the other calendar and honours an HTTP-date Retry-After', () => {
  const h = fixture(), started = h.start();
  h.api.setFault((stage, call) => {if (stage === 'before' && call.method === 'Events.insert') {const error = apiError(403, 'userRateLimitExceeded'); error.headers = {'Retry-After': new Date(h.now() + 300000).toUTCString()}; throw error;}});
  const paused = h.batch(started.syncRunId); assert.equal(paused.nextAttemptEpochMs - h.now(), 300000);
  const before = h.api.calls.length;
  assert.throws(() => h.sandbox.syncTarget_({id: h.sandbox.setting_('PARENT_CALENDAR_ID')}, 'parent', h.rows[0], true), error => error.calendarDeferred);
  assert.equal(h.api.calls.length, before);
});

test('A lost wipe response resumes its saved ID without a duplicate delete and completes through the worker', () => {
  const h = fixture(); h.api.seedEvent(h.calendarId, {id: 'wipe1', start: {date: '2026-09-14'}, end: {date: '2026-09-15'}});
  h.sandbox.writeCalendarWipeSession_({wipeId: 'WIPE-LOST', target: 'staff', year: 2026, calendarId: h.calendarId, startDate: '2026-01-01', endDate: '2026-12-31', initialCount: 1, deletedTotal: 0, startedBy: 'admin'});
  h.api.setFault((stage, call) => {if (stage === 'after' && call.method === 'Events.remove') throw apiError(429, 'rateLimitExceeded');});
  const paused = h.call('calendarWipeBatch', {wipeId: 'WIPE-LOST'});
  assert.equal(paused.deletedTotal, 0); assert.equal(paused.remaining, 1); assert.equal(h.api.live(h.calendarId).length, 0);
  h.advance(paused.nextAttemptEpochMs - h.now()); h.api.setFault(null);
  const done = h.sandbox.apiContinueCalendarSync_();
  assert.equal(done.completed, true); assert.equal(done.deletedTotal, 1);
  assert.equal(writes(h).filter(call => call.method === 'Events.remove').length, 1);
});

test('A successful resumed batch clears escalation, while duplicate manual clicks cannot clear a daily quota', () => {
  const h = fixture(6), started = h.start(); let limited = false;
  h.api.setFault((stage, call) => {if (!limited && stage === 'before' && call.method === 'Events.insert') {limited = true; throw apiError(429, 'rateLimitExceeded');}});
  const paused = h.batch(started.syncRunId); h.advance(paused.nextAttemptEpochMs - h.now());
  const partial = h.batch(started.syncRunId); assert.equal(partial.remaining, 1);
  h.advance(60000); h.api.setFault((stage, call) => {if (stage === 'before' && call.method === 'Events.insert') throw apiError(429, 'rateLimitExceeded');});
  assert.equal(h.batch(started.syncRunId).nextAttemptEpochMs - h.now(), 60000);
  const daily = fixture(), dailyStart = daily.start();
  daily.api.setFault((stage, call) => {if (stage === 'before' && call.method === 'Events.insert') throw apiError(403, 'dailyLimitExceeded');});
  const blocked = daily.batch(dailyStart.syncRunId), calls = daily.api.calls.length;
  for (let i = 0; i < 3; i++) assert.equal(daily.start().manualReview, true);
  assert.equal(daily.api.calls.length, calls); assert(blocked.nextAttemptEpochMs - daily.now() >= 86400000);
});


test('A cold runtime reads the persisted checkpoint and account cooldown before any provider call', () => {
  const h = fixture(2), started = h.start();
  h.api.setFault((stage, call) => {if (stage === 'before' && call.method === 'Events.insert') throw apiError(429, 'rateLimitExceeded');});
  const paused = h.batch(started.syncRunId), calls = h.api.calls.length;
  const cold = fixture(2);
  for (const [key, value] of h.props) cold.props.set(key, value);
  for (const [key, sheet] of h.sheets) cold.sheets.get(key).values = JSON.parse(JSON.stringify(sheet.values));
  cold.sandbox.Calendar = h.api.api;
  assert.equal(cold.sandbox.apiContinueCalendarSync_().state, 'paused'); assert.equal(h.api.calls.length, calls);
  cold.advance(paused.nextAttemptEpochMs - cold.now()); h.api.setFault(null);
  assert.equal(cold.sandbox.apiContinueCalendarSync_().completed, true);
  assert.equal(h.api.live(h.calendarId).length, 2);
});

test('Wipe revalidates the saved ID against the confirmed date window after a cooldown', () => {
  const h = fixture(); h.api.seedEvent(h.calendarId, {id: 'wipe1', start: {date: '2026-09-14'}, end: {date: '2026-09-15'}});
  h.sandbox.writeCalendarWipeSession_({wipeId: 'WIPE-MOVED', target: 'staff', year: 2026, calendarId: h.calendarId, startDate: '2026-01-01', endDate: '2026-12-31', initialCount: 1, deletedTotal: 0, startedBy: 'admin'});
  h.api.setFault((stage, call) => {if (stage === 'before' && call.method === 'Events.remove') throw apiError(429, 'rateLimitExceeded');});
  const paused = h.call('calendarWipeBatch', {wipeId: 'WIPE-MOVED'});
  h.api.externalPatch(h.calendarId, 'wipe1', {start: {date: '2027-09-14'}, end: {date: '2027-09-15'}});
  h.advance(paused.nextAttemptEpochMs - h.now()); h.api.setFault(null);
  const done = h.call('calendarWipeBatch', {wipeId: 'WIPE-MOVED'});
  assert.equal(done.completed, true); assert.equal(done.deletedTotal, 0); assert.equal(h.api.live(h.calendarId).length, 1);
});

if (failures) process.exitCode = 1;
