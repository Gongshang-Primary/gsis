/* Independent relief policy regression review. Uses the actual shared domain. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const ops = require('../shared/roster-operations.js');
const roster = require('../shared/roster.js');
const tests = [];
const test = (name, run) => tests.push({ name, run });
const clone = value => JSON.parse(JSON.stringify(value));
const TODAY = '2026-10-14';
let serial = 0;
function fixture() {
  const blank = () => Array.from({ length: 18 }, () => ['', '', '', '']);
  const a = blank(), b = blank(), c = blank(), d = blank();
  a[2] = ['EL', '1A', 'R1', '']; a[3] = [...a[2]];
  a[4] = ['PD', '', 'Staff room', '']; a[5] = ['IMP', '', 'Staff room', ''];
  a[6] = ['Duty', '', 'Canteen', '']; a[17] = ['EL', '1A', 'R1', ''];
  b[2] = ['MA', '1B', 'R2', '']; d[2] = ['SCI', '1C', 'R3', ''];
  const people = [
    { id: 'a', name: 'Teacher A', active: true, mobile: '81234567', employment: '' },
    { id: 'b', name: 'Teacher B', active: true, mobile: '82345678', employment: '' },
    { id: 'c', name: 'Teacher C', active: true, mobile: '83456789', employment: '' },
    { id: 'd', name: 'Teacher D', active: true, mobile: '84567890', employment: '' },
    { id: 'dup', name: 'External duplicate D', active: false, mobile: '+65 8456 7890', employment: 'SRE' },
    { id: 'unknown', name: 'Unverified timetable', active: true, mobile: '', employment: 'FAJT' },
    { id: 'external', name: 'External', active: false, mobile: '', employment: 'SRE' }
  ];
  const teachers = [a, b, c, d].map((cells, i) => ({ staffId: 'abcd'[i], cells, R: 1 }));
  const periods = Array.from({ length: 18 }, (_, period) => ({ period, startMinutes: 420 + 30 * period, endMinutes: 450 + 30 * period }));
  const days = {};
  for (const date of ['2026-10-13', TODAY, '2026-10-15']) days[date] = { id: 'baseline', parity: 'single', schoolDay: true, teachers: clone(teachers), periods: clone(periods) };
  const ctx = { today: TODAY, minute: 700, now: Date.parse(TODAY + 'T03:40:00Z'), iso: TODAY + 'T03:40:00Z', user: { staffId: 'a', email: 'a@gsps.edu.sg', smc: false, admin: false }, days, people, timetableEntries: [{ id: 'baseline', from: '2026-01-01', to: '2026-12-31' }], notificationsConfigured: false, adminRecipients: [], uuid: () => 'review-' + ++serial };
  return { state: ops.initial(), ctx };
}
const user = (ctx, id, roles = {}) => ({ ...ctx, user: { staffId: id, email: id + '@gsps.edu.sg', smc: false, admin: false, ...roles } });
const smc = ctx => user(ctx, 'c', { smc: true });
function save(state, ctx, staffId = 'a', periods = [2, 3], more = {}) {
  const actor = staffId === ctx.user.staffId ? ctx : smc(ctx);
  return ops.apply(state, actor, { operation: 'saveAbsence', date: TODAY, staffId, typeId: 'mc', periods, ...more }).savedId;
}
const demands = (state, ctx, absenceId) => ops.demand(ctx, state, TODAY).filter(d => d.absenceId === absenceId).map(d => d.id);
const rejects = (run, status) => assert.throws(run, e => e.status === status);

test('own absence access, separate SMC/Admin authority, and past locks', () => {
  const { state, ctx } = fixture();
  const id = save(state, ctx);
  rejects(() => ops.apply(state, user(ctx, 'b'), { operation: 'saveInstructions', absenceId: id, instructions: {} }), 403);
  rejects(() => ops.apply(state, user(ctx, 'b', { admin: true }), { operation: 'deleteAbsences', ids: [id], confirm: true }), 403);
  rejects(() => ops.apply(state, user(ctx, 'b', { admin: true }), { operation: 'saveAdhoc', date: TODAY, staffId: 'external', periods: [2] }), 403);
  rejects(() => ops.apply(state, smc(ctx), { operation: 'saveTypes', types: ops.defaults() }), 403);
  state.absences[0].date = '2026-10-13';
  for (const actor of [ctx, smc(ctx), user(ctx, 'a', { admin: true })]) {
    rejects(() => ops.apply(state, actor, { operation: 'deleteAbsences', ids: [id], confirm: true }), 403);
    rejects(() => ops.apply(state, actor, { operation: 'saveInstructions', absenceId: id, instructions: {} }), 403);
  }
  assert.equal(ops.view(state, ctx).ownAbsences[0].editable, false);
});

test('separate submissions remain distinct; overlaps block by ID and normalised mobile', () => {
  const { state, ctx } = fixture();
  const one = save(state, ctx, 'a', [2]);
  const two = save(state, ctx, 'a', [3]);
  assert.notEqual(one, two);
  rejects(() => save(state, ctx, 'a', [2]), 409);
  save(state, ctx, 'd', [7]);
  rejects(() => save(state, ctx, 'dup', [7]), 409);
  assert.equal(ops.mobile('0065 8456-7890'), ops.mobile('84567890'));
});

test('LSE Singapore gate, today-only scope, period time and LSB boundaries are server rules', () => {
  const { state, ctx } = fixture();
  rejects(() => save(state, { ...ctx, minute: 674 }, 'a', [9], { typeId: 'lse' }), 400);
  rejects(() => save(state, ctx, 'a', [8], { typeId: 'lse' }), 400);
  rejects(() => save(state, ctx, 'a', [9], { typeId: 'lse', date: '2026-10-15' }), 400);
  rejects(() => save(state, ctx, 'a', [9], { typeId: 'lse', selectAll: true }), 400);
  save(state, ctx, 'a', [9], { typeId: 'lse' });
  rejects(() => save(state, ctx, 'b', [12], { typeId: 'lsb' }), 400);
  save(state, ctx, 'b', [0, 11], { typeId: 'lsb' });
});

test('PD and IMP are busy but do not need relief; Duty and late teaching do', () => {
  const { state, ctx } = fixture();
  const id = save(state, ctx, 'a', [2, 3, 4, 5, 6, 17]);
  assert.deepEqual(ops.demand(ctx, state, TODAY).map(d => d.period), [2, 3, 6, 17]);
  const rows = ops.demand(ctx, state, TODAY).filter(d => d.absenceId === id);
  assert.equal(rows[0].lessonKey, rows[1].lessonKey);
  assert.notEqual(rows[1].lessonKey, rows[2].lessonKey);
  assert.equal(ops.availability(state, ctx, 'a', TODAY, [4]).available, false);
  assert.equal(ops.availability(state, ctx, 'a', TODAY, [5]).available, false);
  assert.equal(ops.availability(state, ctx, 'unknown', TODAY, [2]).available, false);
  assert.equal(ops.availability(state, ctx, 'unknown', TODAY, [2]).R, null);
});

test('ordinary users do not receive other absences, mobile numbers or draft assignments', () => {
  const { state, ctx } = fixture();
  const id = save(state, ctx);
  save(state, ctx, 'b', [7]);
  ops.apply(state, smc(ctx), { operation: 'assign', date: TODAY, demandIds: demands(state, ctx, id), staffId: 'c' });
  const own = ops.view(state, ctx);
  assert.equal(own.absences.length, 1);
  assert.equal(own.assignments.length, 0);
  assert(own.people.every(p => !Object.hasOwn(p, 'mobile')));
  assert(own.timetable.teachers.filter(t => t.staffId !== 'a').every(t => !Object.hasOwn(t, 'R')));
  const candidateView = ops.read(state, ctx, { operation: 'candidates', demandIds: demands(state, ctx, id) });
  assert(candidateView.candidates.every(t => !Object.hasOwn(t, 'R') && !Object.hasOwn(t, 'remaining') && !Object.hasOwn(t, 'assigned')));
  const colleague = ops.view(state, user(ctx, 'c'));
  assert.equal(colleague.myDuties.length, 0);
  assert.equal(colleague.assignments.length, 0);
  ops.apply(state, smc(ctx), { operation: 'publish', date: TODAY });
  assert.equal(ops.view(state, user(ctx, 'c')).myDuties.length, 2);
  assert.equal(ops.view(state, user(ctx, 'b')).myDuties.length, 0);
});

test('mutual approval is recipient-only, confirms immediately, counts R once, and cancellation removes it', () => {
  const { state, ctx } = fixture();
  const id = save(state, ctx);
  const result = ops.apply(state, ctx, { operation: 'requestMutual', absenceId: id, requests: [{ recipientId: 'c', demandIds: demands(state, ctx, id) }] });
  const requestId = result.savedId;
  assert.equal(ops.view(state, user(ctx, 'c')).myDuties.length, 0);
  rejects(() => ops.apply(state, user(ctx, 'b'), { operation: 'respondMutual', id: requestId, decision: 'approve' }), 403);
  rejects(() => ops.apply(state, user(ctx, 'c'), { operation: 'respondMutual', id: requestId, decision: 'reject', reason: '' }), 400);
  ops.apply(state, user(ctx, 'c'), { operation: 'respondMutual', id: requestId, decision: 'approve' });
  assert.equal(ops.view(state, user(ctx, 'c')).myDuties.length, 2);
  const capacity = ops.availability(state, ctx, 'c', TODAY, [7]);
  assert.equal(capacity.assigned, 2);
  assert.equal(capacity.R, 1);
  assert(capacity.warnings.includes('Above advisory relief quota.'));
  rejects(() => ops.apply(state, user(ctx, 'c'), { operation: 'respondMutual', id: requestId, decision: 'approve' }), 409);
  ops.apply(state, ctx, { operation: 'deleteAbsences', ids: [id], confirm: true });
  assert.equal(ops.view(state, user(ctx, 'c')).myDuties.length, 0);
  assert.equal(ops.availability(state, ctx, 'c', TODAY, [7]).assigned, 0);
});

test('availability is rechecked when a mutual request is approved', () => {
  const { state, ctx } = fixture();
  const id = save(state, ctx, 'a', [2]);
  const requestId = ops.apply(state, ctx, { operation: 'requestMutual', absenceId: id, requests: [{ recipientId: 'c', demandIds: demands(state, ctx, id) }] }).savedId;
  save(state, ctx, 'c', [2]);
  rejects(() => ops.apply(state, user(ctx, 'c'), { operation: 'respondMutual', id: requestId, decision: 'approve' }), 409);
  assert.equal(state.assignments.length, 0);
});

test('a pending mutual request cannot silently approve a changed lesson', () => {
  const { state, ctx } = fixture();
  const id = save(state, ctx, 'a', [2]);
  const requestId = ops.apply(state, ctx, { operation: 'requestMutual', absenceId: id, requests: [{ recipientId: 'c', demandIds: demands(state, ctx, id) }] }).savedId;
  ctx.days[TODAY].teachers[0].cells[2] = ['SCI', '6Z', 'Science lab', ''];
  rejects(() => ops.apply(state, user(ctx, 'c'), { operation: 'respondMutual', id: requestId, decision: 'approve' }), 409);
  assert.equal(state.assignments.length, 0);
});

test('mutual override needs confirmation and replaces published cover only at publish', () => {
  const { state, ctx } = fixture();
  const id = save(state, ctx, 'a', [3]);
  const ids = demands(state, ctx, id);
  const requestId = ops.apply(state, ctx, { operation: 'requestMutual', absenceId: id, requests: [{ recipientId: 'c', demandIds: ids }] }).savedId;
  ops.apply(state, user(ctx, 'c'), { operation: 'respondMutual', id: requestId, decision: 'approve' });
  const payload = { operation: 'assign', date: TODAY, demandIds: ids, staffId: 'b' };
  rejects(() => ops.apply(state, smc(ctx), payload), 409);
  ops.apply(state, smc(ctx), { ...payload, confirmOverride: true });
  assert.equal(ops.view(state, user(ctx, 'c')).myDuties.length, 1);
  assert.equal(ops.view(state, user(ctx, 'b')).myDuties.length, 0);
  ops.apply(state, smc(ctx), { operation: 'publish', date: TODAY });
  assert.equal(ops.view(state, user(ctx, 'c')).myDuties.length, 0);
  assert.equal(ops.view(state, user(ctx, 'b')).myDuties.length, 1);
  assert.deepEqual(state.outbox.filter(j => j.kind === 'mutual_override').map(j => j.recipientId).sort(), ['a', 'b', 'c']);
});

test('one command cannot allocate one person to two different lessons at the same period', () => {
  const { state, ctx } = fixture();
  const one = save(state, ctx, 'a', [2]), two = save(state, ctx, 'b', [2]);
  const ids = [...demands(state, ctx, one), ...demands(state, ctx, two)];
  rejects(() => ops.apply(state, smc(ctx), { operation: 'assign', date: TODAY, demandIds: ids, staffId: 'c' }), 409);
});

test('duplicate-mobile ad hoc activation cannot bypass an existing timetable', () => {
  const { state, ctx } = fixture();
  ops.apply(state, smc(ctx), { operation: 'saveAdhoc', date: TODAY, staffId: 'dup', periods: [2, 3] });
  assert.equal(ops.availability(state, ctx, 'dup', TODAY, [2]).available, false);
  assert.equal(ops.availability(state, ctx, 'dup', TODAY, [3]).available, true);
});

test('pruning uses past-only default and still requires Admin authority', () => {
  const { state, ctx } = fixture();
  save(state, ctx);
  const command = { operation: 'prune', from: TODAY, to: '2026-10-15', confirm: true };
  rejects(() => ops.apply(state, smc(ctx), command), 403);
  rejects(() => ops.apply(state, user(ctx, 'c', { admin: true }), command), 400);
  assert.equal(state.absences.length, 1);
});

function adapter(initial = ops.initial()) {
  let durable = clone(initial), writes = 0, locked = false, loseCommitResponse = false, beforeLock = null;
  const { ctx } = fixture();
  const clock = { now: ctx.now };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const properties = { ROSTER_OPERATIONS_FILE: 'operations-file' };
  const scope = vm.createContext({
    GSISRosterOperations: ops, GSISRoster: roster, Date: ClockDate, ROSTER_DATA: 'data-folder',
    props_: () => ({ getProperty: name => properties[name] || null, setProperty: (name, value) => { properties[name] = value; } }),
    rosterFindFile_: () => 'operations-file', rosterReadFile_: () => JSON.stringify(durable),
    rosterDriveRequest_: (url, options) => {
      assert.equal(locked, true, 'Every write must hold the script lock');
      durable = JSON.parse(options.payload); writes++;
      if (loseCommitResponse) { loseCommitResponse = false; throw new Error('Drive acknowledged late'); }
      return { id: 'operations-file' };
    },
    error_: (status, message) => { throw Object.assign(new Error(message), { status }); },
    LockService: { getScriptLock: () => ({}) },
    deployLock_: () => { assert.equal(locked, false); if (beforeLock) { const run = beforeLock; beforeLock = null; run(); } locked = true; return true; },
    deployUnlock_: () => { assert.equal(locked, true); locked = false; },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest()),
      getUuid: () => crypto.randomUUID()
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/RosterOperations.gs'), 'utf8'), scope);
 require('./load-stapler-leases.cjs')(scope);
  scope.rosterOperationsContext_ = req => ({ ...ctx, now: clock.now, iso: new Date(clock.now).toISOString(), user: { ...ctx.user, ...req.identity } });
  scope.rosterServiceContacts_ = () => ({ identity: ctx.user, c: { rosterPeople: ctx.people } });
  const request = (input, identity = {}) => ({ identity: { ...ctx.user, ...identity }, input });
  return {
    call: (input, identity) => scope.rosterOperationsDispatch_(request(input, identity), {}),
    service: input => scope.rosterServiceDispatch_({ input }),
    state: () => clone(durable), writes: () => writes, locked: () => locked,
    loseNextResponse: () => { loseCommitResponse = true; }, beforeNextLock: run => { beforeLock = run; }, scope, ctx, clock
  };
}

test('actual storage adapter retries an uncertain commit without duplicating absence or audit', () => {
  const h = adapter();
  const input = { operation: 'saveAbsence', requestId: crypto.randomUUID(), revision: 0, date: TODAY, staffId: 'a', periods: [2], typeId: 'mc' };
  h.loseNextResponse();
  assert.throws(() => h.call(input), /acknowledged late/);
  assert.equal(h.locked(), false);
  assert.equal(h.state().absences.length, 1);
  assert.equal(h.state().audit.length, 1);
  const replay = h.call(input);
  assert.equal(replay.replayed, true);
  assert.equal(h.state().revision, 1);
  assert.equal(h.state().absences.length, 1);
  assert.equal(h.state().audit.length, 1);
  assert.equal(h.writes(), 1);
});

test('actual storage adapter rejects stale revisions and changed request-ID payload or actor', () => {
  const h = adapter();
  const input = { operation: 'saveAbsence', requestId: crypto.randomUUID(), revision: 0, date: TODAY, staffId: 'a', periods: [2], typeId: 'mc' };
  h.call(input);
  rejects(() => h.call({ ...input, periods: [3] }), 409);
  rejects(() => h.call(input, { email: 'b@gsps.edu.sg', staffId: 'b' }), 409);
  rejects(() => h.call({ ...input, requestId: crypto.randomUUID(), periods: [3] }), 409);
  assert.equal(h.writes(), 1);
  assert.equal(h.locked(), false);
  h.call({ ...input, requestId: crypto.randomUUID(), revision: 1, periods: [3] });
  assert.equal(h.state().absences.length, 2);
  assert.equal(h.state().revision, 2);
});

test('multi-date validation failure cannot commit an earlier valid date from the same command', () => {
  const { state, ctx } = fixture();
  save(state, ctx, 'a', [2], { date: '2026-10-15' });
  const h = adapter(state);
  rejects(() => h.call({ operation: 'saveAbsence', requestId: crypto.randomUUID(), revision: 0, from: TODAY, to: '2026-10-15', staffId: 'a', periods: [2], typeId: 'mc' }), 409);
  assert.equal(h.writes(), 0);
  assert.equal(h.state().absences.length, 1);
  assert.equal(h.state().absences[0].date, '2026-10-15');
  assert.equal(h.locked(), false);
});

function queueFixture() {
  const { state, ctx } = fixture();
  state.outbox.push({ id: 'notice-1', key: 'once', kind: 'mutual_override', recipientId: 'a', mobile: '6581234567', date: TODAY, status: 'queued', expiresAt: ctx.now + 3600000, attempts: 0 });
  return state;
}

test('notification leases prevent repeat sends and convert abandoned attempts to uncertain', () => {
  const h = adapter(queueFixture());
  const first = h.service({ operation: 'claimNotifications', limit: 5 });
  assert.equal(first.notifications.length, 1);
  const claim = first.notifications[0];
  assert.equal(h.service({ operation: 'claimNotifications' }).notifications.length, 0);
  h.clock.now += 121000;
  assert.equal(h.service({ operation: 'claimNotifications' }).notifications.length, 0);
  assert.equal(h.state().outbox[0].status, 'uncertain');
  assert.equal(h.state().outbox[0].attempts, 1);
  rejects(() => h.service({ operation: 'notificationResult', id: 'notice-1', claimId: 'forged', state: 'sent' }), 409);
  h.service({ operation: 'notificationResult', id: 'notice-1', claimId: claim.claimId, state: 'sent', messageId: 'wamid.1' });
  const writes = h.writes();
  h.service({ operation: 'notificationResult', id: 'notice-1', claimId: claim.claimId, state: 'sent', messageId: 'wamid.1' });
  assert.equal(h.writes(), writes);
  assert.equal(h.state().outbox[0].status, 'sent');
  assert.equal(h.service({ operation: 'claimNotifications' }).notifications.length, 0);
});

test('expired and superseded mutual requests are never claimed for delivery', () => {
  const state = queueFixture();
  state.outbox[0].expiresAt = 1;
  state.outbox.push({ ...state.outbox[0], id: 'notice-2', kind: 'mutual_request', requestId: 'old-request', expiresAt: Date.parse('2026-10-20') });
  state.requests.push({ id: 'old-request', status: 'approved' });
  const h = adapter(state);
  assert.equal(h.service({ operation: 'claimNotifications' }).notifications.length, 0);
  assert(h.state().outbox.every(row => row.status === 'cancelled'));
});

test('delivery webhooks are recipient checked, deduplicated and monotonic', () => {
  const state = queueFixture();
  Object.assign(state.outbox[0], { status: 'uncertain', messageId: 'wamid.1' });
  const h = adapter(state);
  const event = { operation: 'notificationDelivery', eventId: 'delivery-one', state: 'read', messageId: 'wamid.1', recipientId: '6581234567' };
  rejects(() => h.service({ ...event, recipientId: '6599999999' }), 403);
  h.service(event);
  assert.equal(h.state().outbox[0].status, 'sent');
  assert.equal(h.state().outbox[0].deliveryStatus, 'read');
  const writes = h.writes();
  h.service(event);
  assert.equal(h.writes(), writes);
  h.service({ ...event, eventId: 'delivery-two', state: 'delivered' });
  h.service({ ...event, eventId: 'delivery-three', state: 'failed' });
  assert.equal(h.state().outbox[0].deliveryStatus, 'read');
});

test('private service duties project recipient/date/published only and cannot invoke school operations', () => {
  const { state, ctx } = fixture();
  const absenceId = save(state, ctx, 'a', [3]);
  const demandId = demands(state, ctx, absenceId)[0];
  ops.apply(state, smc(ctx), { operation: 'saveAdhoc', date: TODAY, staffId: 'external', periods: [3] });
  ops.apply(state, smc(ctx), { operation: 'assign', date: TODAY, demandIds: [demandId], staffId: 'external' });
  ops.apply(state, smc(ctx), { operation: 'publish', date: TODAY });
  const original = state.assignments[0];
  state.assignments = [
    { ...original, id: 'own-published' },
    { ...original, id: 'own-draft', status: 'draft' },
    { ...original, id: 'own-other-date', date: '2026-10-13' },
    { ...original, id: 'other-person', staffId: 'c' }
  ];
  const h = adapter(state);
  const capability = { staffId: 'external', date: TODAY, purpose: 'duties', expiresAt: ctx.now + 3600000 };
  const result = h.service({ operation: 'externalDuties', capability });
  assert.deepEqual(Array.from(result.duties, d => d.id), ['own-published']);
  rejects(() => h.service({ operation: 'saveAbsence', capability }), 403);
  rejects(() => h.service({ operation: 'externalRespond', capability, decision: 'approve' }), 403);
  rejects(() => h.service({ operation: 'externalDuties', capability: { ...capability, expiresAt: 1 } }), 401);
});

function publishedFixture(mutual = false) {
  const { state, ctx } = fixture();
  const id = save(state, ctx, 'a', [3]);
  if (mutual) {
    const requestId = ops.apply(state, ctx, { operation: 'requestMutual', absenceId: id, requests: [{ recipientId: 'c', demandIds: demands(state, ctx, id) }] }).savedId;
    ops.apply(state, user(ctx, 'c'), { operation: 'respondMutual', id: requestId, decision: 'approve' });
  } else {
    ops.apply(state, smc(ctx), { operation: 'assign', date: TODAY, demandIds: demands(state, ctx, id), staffId: 'c' });
    ops.apply(state, smc(ctx), { operation: 'publish', date: TODAY });
  }
  return { state, ctx };
}

test('read reconciliation persists changed timetable cancellation and never resurrects old cover', () => {
  const { state } = publishedFixture(true);
  const h = adapter(state);
  h.ctx.timetableEntries = [];
  const result = h.call({ operation: 'read', date: TODAY }, { staffId: 'c', email: 'c@gsps.edu.sg' });
  assert.equal(result.myDuties.length, 0);
  assert.equal(result.myDutyUpdates.length, 1);
  assert.match(result.myDutyUpdates[0].invalidReason, /timetable changed/);
  assert.equal(h.state().assignments[0].status, 'invalidated');
  assert.deepEqual(h.state().outbox.filter(j => j.kind === 'mutual_override').map(j => j.recipientId).sort(), ['a', 'c']);
  h.ctx.timetableEntries = [{ id: 'baseline', from: '2026-01-01', to: '2026-12-31' }];
  assert.equal(h.call({ operation: 'read', date: TODAY }, { staffId: 'c' }).myDuties.length, 0);
});

test('Calendar outage preserves published cover and past snapshots while withholding availability', () => {
  const { state } = publishedFixture();
  state.assignments.push({ ...state.assignments[0], id: 'past-snapshot', date: '2026-10-13' });
  const h = adapter(state);
  Object.assign(h.ctx.days[TODAY], { verified: false, schoolDay: false, teachers: [], warning: 'Calendar unavailable.' });
  const result = h.call({ operation: 'read', date: TODAY }, { staffId: 'c' });
  assert.equal(result.myDuties.length, 2);
  assert.equal(h.writes(), 0);
  assert.equal(ops.availability(h.state(), h.ctx, 'c', TODAY, [7]).available, false);
  h.ctx.timetableEntries = [];
  const after = h.call({ operation: 'read', date: TODAY }, { staffId: 'c' });
  assert.deepEqual(Array.from(after.myDuties, row => row.id), ['past-snapshot']);
});

test('concurrent delivery updates cannot be overwritten by read reconciliation', () => {
  const { state } = publishedFixture();
  state.outbox = queueFixture().outbox;
  Object.assign(state.outbox[0], { status: 'sent', messageId: 'wamid.race' });
  const h = adapter(state);
  h.ctx.timetableEntries = [];
  h.beforeNextLock(() => h.service({ operation: 'notificationDelivery', eventId: 'race-delivery', state: 'read', messageId: 'wamid.race', recipientId: '6581234567' }));
  const result = h.call({ operation: 'read', date: TODAY }, { staffId: 'c' });
  assert.equal(result.myDuties.length, 0);
  assert.equal(result.myDutyUpdates.length, 1);
  assert.equal(result.revision, 1, 'Only the actual assignment invalidation advances domain revision');
  assert.equal(h.state().outbox[0].deliveryStatus, 'read');
  assert.deepEqual(h.state().deliveryEvents, ['race-delivery']);
  assert.equal(h.state().assignments[0].status, 'invalidated');
});

test('queue claims, send results and delivery callbacks do not stale the next school save', () => {
  const h = adapter();
  const absence = h.call({ operation: 'saveAbsence', requestId: crypto.randomUUID(), revision: 0, date: TODAY, staffId: 'a', periods: [3], typeId: 'mc' });
  const requested = h.call({ operation: 'requestMutual', requestId: crypto.randomUUID(), revision: absence.revision, date: TODAY, absenceId: absence.savedId, requests: [{ recipientId: 'c', demandIds: [absence.savedId + ':3'] }] });
  const claim = h.service({ operation: 'claimNotifications' }).notifications[0];
  assert(claim);
  assert.equal(h.state().revision, requested.revision);
  h.service({ operation: 'notificationResult', id: claim.id, claimId: claim.claimId, state: 'sent', messageId: 'wamid.background' });
  assert.equal(h.state().revision, requested.revision);
  h.service({ operation: 'notificationDelivery', eventId: 'background-delivery', state: 'delivered', messageId: 'wamid.background', recipientId: '6583456789' });
  assert.equal(h.state().revision, requested.revision);
  const saved = h.call({ operation: 'saveInstructions', requestId: crypto.randomUUID(), revision: requested.revision, date: TODAY, absenceId: absence.savedId, instructions: {} });
  assert.equal(saved.revision, requested.revision + 1);
  assert.equal(h.state().outbox[0].deliveryStatus, 'delivered');
});

test('external approval remains a real domain revision and invalidates stale school saves', () => {
  const h = adapter();
  const absence = h.call({ operation: 'saveAbsence', requestId: crypto.randomUUID(), revision: 0, date: TODAY, staffId: 'a', periods: [3], typeId: 'mc' });
  const requested = h.call({ operation: 'requestMutual', requestId: crypto.randomUUID(), revision: absence.revision, date: TODAY, absenceId: absence.savedId, requests: [{ recipientId: 'c', demandIds: [absence.savedId + ':3'] }] });
  const capability = { staffId: 'c', date: TODAY, purpose: 'mutual', requestId: requested.savedId, expiresAt: h.ctx.now + 3600000 };
  h.service({ operation: 'externalRespond', capability, decision: 'approve', reason: '' });
  assert.equal(h.state().revision, requested.revision + 1);
  assert.equal(h.state().assignments[0].status, 'published');
  rejects(() => h.call({ operation: 'saveInstructions', requestId: crypto.randomUUID(), revision: requested.revision, date: TODAY, absenceId: absence.savedId, instructions: {} }), 409);
});

test('actual Deploy entry point separates notification service credentials from school identity', () => {
  const h = adapter();
  const script = fs.readFileSync(path.join(__dirname, '../backend/Code.gs'), 'utf8');
  const begin = script.indexOf('function doPost(e)'), end = script.indexOf('\nfunction ', begin + 10);
  assert(begin >= 0 && end > begin);
  const secrets = { BRIDGE_SECRET: 'school-bridge-secret-for-review-12345', ROSTER_SERVICE_SECRET: 'service-secret-for-review-123456789' };
  const sign = (payload, secret) => crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const scope = vm.createContext({
    Date: h.scope.Date, GSIS_DEPLOY_VERSION: '0.7.00', GSISSheets: { resetStats() {} },
    props_: () => ({ getProperty: key => secrets[key] }),
    Utilities: { getUuid: () => crypto.randomUUID() },
    signature_: sign, same_: (a, b) => a === b,
    error_: (status, message) => { throw Object.assign(new Error(message), { status }); },
    rosterDiagnostic_() {}, rosterDiagnosticError_: e => e.message, rosterDiagnosticText_: text => text,
    out_: value => value,
    rosterServiceDispatch_: req => h.scope.rosterServiceDispatch_(req)
  });
  vm.runInContext(script.slice(begin, end), scope);
  const call = (changes = {}, key = 'ROSTER_SERVICE_SECRET') => {
    const payload = JSON.stringify({ action: 'rosterService', service: 'gsis-roster-notifier-v1', timestamp: h.clock.now, nonce: crypto.randomUUID(), input: { operation: 'claimNotifications' }, ...changes });
    return scope.doPost({ postData: { contents: JSON.stringify({ payload, signature: sign(payload, secrets[key]) }) } });
  };
  assert.equal(call().ok, true);
  assert.equal(call({}, 'BRIDGE_SECRET').status, 401);
  assert.equal(call({ action: 'rosterOperations', identity: { email: 'admin@gsps.edu.sg', subject: 'forged' } }).status, 401);
  assert.equal(call({ timestamp: h.clock.now - 60001 }).status, 401);
  assert.equal(call({ nonce: 'not-a-valid-nonce' }).status, 401);
  assert.equal(call({ service: 'not-gsis' }).status, 401);
  assert.equal(call({ input: { operation: 'saveAbsence', staffId: 'a', periods: [2] } }).status, 403);
  assert.equal(h.state().absences.length, 0);
});

let failed = 0;
for (const { name, run } of tests) {
  try { run(); process.stdout.write('PASS ' + name + '\n'); }
  catch (error) { failed++; process.stderr.write('FAIL ' + name + '\n' + error.stack + '\n'); }
}
assert.equal(failed, 0, failed + ' independent relief regression(s) failed');
