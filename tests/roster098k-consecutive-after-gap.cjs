'use strict';
// roster-consecutive-after-gap: an unchanged teacher on a Stapler day keeps
// the full baseline occupancy, so P5 + P7-P12 with P6 prospective is a run
// of 8 and trips the six-consecutive rule. Periods are 0-based cell indices
// here: P5 is index 4, P6 is index 5, P7-P12 are indices 6-11.
const assert = require('node:assert/strict');
const A = require('../shared/roster-allocation.js');
const S = require('../shared/roster-stapler.js');
const O = require('../shared/roster-operations.js');

const DATE = '2026-11-02';
const periods = Array.from({length: 17}, (_, period) => ({period, startMinutes: 420 + 30 * period, endMinutes: 450 + 30 * period}));
const blank = () => Array.from({length: 17}, () => ['', '', '', '']);
const formClasses = [
  {id: 'a', name: '5A', level: 5, traditional: true},
  {id: 'b', name: '5B', level: 5, traditional: true},
  {id: 'c', name: '5C', level: 5, traditional: true},
  {id: 'd', name: '5D', level: 5, traditional: true},
  {id: 'e', name: '5E', level: 5, traditional: true},
  {id: 'f', name: '5F', level: 5, traditional: true},
  {id: 'g', name: '4A', level: 4, traditional: true},
];
function chuanCells(lessons) {
  const c = blank();
  for (const [index, subject, cls] of lessons) c[index] = [subject, cls, 'C1-0' + (index % 9 + 1), ''];
  return c;
}
function otherCells() {
  const c = blank(); c[2] = ['MA', '4A', 'C2-01', '']; return c;
}
const chuanLessons = [
  [4, 'EL', '5A'], [6, 'EL', '5A'], [7, 'TL', '5B'], [8, 'EL', '5C'],
  [9, 'TL', '5D'], [10, 'EL', '5E'], [11, 'EL', '5F'],
];
function fullDay(lessons = chuanLessons) {
  return {date: DATE, id: 'baseline-2nov', parity: 'single', schoolDay: true, verified: true, periods, recesses: [], formClasses,
    teachers: [
      {staffId: 'chuan', name: 'Chuan Song', timetableName: 'Chuan Song', cells: chuanCells(lessons)},
      {staffId: 'other', name: 'Other Teacher', timetableName: 'Other Teacher', cells: otherCells()},
    ]};
}
function subsetDay() {
  return {date: DATE, id: 'baseline-2nov', parity: 'single', schoolDay: true, verified: true, periods, recesses: [], formClasses,
    teachers: [{staffId: 'other', name: 'Other Teacher', timetableName: 'Other Teacher', cells: otherCells()}]};
}
function makeCtx(day, exclusions) {
  const ctx = {subjects: ['EL', 'TL', 'MA'], today: DATE, now: Date.parse(DATE + 'T00:00:00Z'), iso: DATE + 'T00:00:00Z', minute: 360,
    user: {staffId: 'other', email: 'other@gsps.edu.sg', smc: true, admin: true},
    people: [
      {id: 'chuan', name: 'Chuan Song', active: true, mobile: '91234567'},
      {id: 'other', name: 'Other Teacher', active: true, mobile: '92345678'},
    ],
    days: {[DATE]: day}, uuid: (() => { let n = 0; return () => 'id-' + (++n); })(),
    notificationsConfigured: false, adminRecipients: [], smcIds: ['other']};
  return ctx;
}
function candidate(ctx, staffId = 'chuan') {
  const state = O.initial();
  if (ctx.exclusions) state.systemConfig.consecutiveCountExclusions = ctx.exclusions;
  A.captureWeek(state, ctx, DATE); state.accountingYears['2026'] = {verified: true};
  const tm = A.teacherContext(state, ctx, DATE);
  const t = tm.get(staffId);
  const demand = {id: 'dem-p6', date: DATE, staffId: 'absent', period: 5, subject: 'EL', className: '5X', groupName: ''};
  const e = A.eligibility(t, 5, [], {demand});
  return {t, e, run: A.runAt(new Set([...t.consecutiveBase, 5]), 5, t.periodCount)};
}
// A Stapler plan that changes only the other teacher and does not cover Chuan Song.
function uncoveredPlan(baseline) {
  let plan = S.create({...subsetDay(), date: DATE});
  const tile = plan.tiles.find(t => t.teacherId === 'other' && t.kind === 'lesson');
  plan = S.apply(plan, {type: 'move', tileId: tile.id, period: 3});
  return S.effectiveDay(plan, baseline);
}
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS', name); }

test('Stapler day, unchanged teacher, P5 and P7-P12 with P6 prospective: violation', () => {
  const day = uncoveredPlan(fullDay());
  const {t, e, run} = candidate(makeCtx(day));
  assert.deepEqual([...t.consecutiveBase].sort((a, b) => a - b), [4, 6, 7, 8, 9, 10, 11]);
  assert.equal(t.periodCount, 17);
  assert.equal(run, 8);
  assert.equal(e.consecutive, 8);
  assert.equal(e.streakViolation, true);
});

test('Same on a baseline day: violation', () => {
  const {t, e, run} = candidate(makeCtx(fullDay()));
  assert.deepEqual([...t.consecutiveBase].sort((a, b) => a - b), [4, 6, 7, 8, 9, 10, 11]);
  assert.equal(run, 8);
  assert.equal(e.consecutive, 8);
  assert.equal(e.streakViolation, true);
});

test('A real gap (P5, P8-P12, P6 prospective): run of 2, no violation', () => {
  const gap = chuanLessons.filter(([index]) => index !== 6);
  const day = uncoveredPlan(fullDay(gap));
  const {e, run} = candidate(makeCtx(day));
  assert.equal(run, 2);
  assert.equal(e.consecutive, 2);
  assert.equal(e.streakViolation, false);
});

test("A Don't-need-relief subject still counts as occupied", () => {
  // TL is in the default Tamil family with reliefRequired false, and is not
  // in consecutiveCountExclusions. The Stapler-day run in the first test
  // already includes TL at indices 7 and 9; here assert it explicitly.
  const day = uncoveredPlan(fullDay());
  const {t} = candidate(makeCtx(day));
  assert(t.consecutiveBase.has(7), 'TL at P8 must count');
  assert(t.consecutiveBase.has(9), 'TL at P10 must count');
});

test('A consecutive-exclusion subject is still excluded', () => {
  const lessons = chuanLessons.map(([index, subject, cls]) => (index === 6 ? [index, 'PAL', cls] : [index, subject, cls]));
  const day = uncoveredPlan(fullDay(lessons));
  const ctx = makeCtx(day); ctx.exclusions = [{type: 'exact', value: 'PAL'}];
  const {t, e, run} = candidate(ctx);
  assert(!t.consecutiveBase.has(6), 'PAL at P7 must be excluded from consecutiveBase');
  assert.equal(run, 2, 'excluded P7 breaks the run at P6');
  assert.equal(e.streakViolation, false);
});

test("A teacher whose Stapler plan does change keeps the plan's periods, not the baseline's", () => {
  const day = uncoveredPlan(fullDay());
  const {t} = candidate(makeCtx(day), 'other');
  assert.deepEqual([...t.base].sort((a, b) => a - b), [3], 'other teacher must keep moved plan period, not baseline period 2');
});

test('A suspended teacher keeps the plan empty periods, not the baseline', () => {
  let plan = S.create({...fullDay(), date: DATE});
  for (const tile of plan.tiles.filter(t => t.teacherId === 'chuan' && t.kind === 'lesson')) {
    plan = S.apply(plan, {type: 'pit', tileId: tile.id});
  }
  const day = S.effectiveDay(plan, fullDay());
  const {t, e} = candidate(makeCtx(day));
  assert.deepEqual([...t.base], []);
  assert.equal(e.streakViolation, false);
});

test('A plan teacher with no lesson tiles at all keeps the baseline cells', () => {
  let plan = S.create({...subsetDay(), date: DATE});
  plan = S.apply(plan, {type: 'addTeacher', teacher: {staffId: 'chuan', name: 'Chuan Song', timetableName: 'Chuan Song'}});
  const day = S.effectiveDay(plan, fullDay());
  const {t, e, run} = candidate(makeCtx(day));
  assert.deepEqual([...t.consecutiveBase].sort((a, b) => a - b), [4, 6, 7, 8, 9, 10, 11]);
  assert.equal(run, 8);
  assert.equal(e.streakViolation, true);
});

console.log(passed + ' consecutive-after-gap checks passed');
