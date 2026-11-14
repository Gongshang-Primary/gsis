import assert from "node:assert/strict";
import Operations from "../shared/roster-operations.js";
import Allocation from "../shared/roster-allocation.js";
import { context } from "../v1/services/roster/context.mjs";
import { allocationSnapshot } from "../v1/services/roster/allocation-snapshot.mjs";
import { forecastCapacity, layeredHealth } from "../v1/services/roster/capacity.mjs";
import { inspectCapacity, runEngine } from "../v1/allocator/index.mjs";
import { writeArtifact } from "../v1/services/roster/repository.mjs";
import { canonical, query } from "../v1/runtime/store.mjs";
import { createDatabase } from "./v1-product/helpers.mjs";
import { hasDatedReliefActivation, isReliefNotificationKind } from "../v1/services/roster/eligibility.mjs";

// Real local owner D1/R2 and context/snapshot paths; Contacts, Calendar and
// Deploy projections are synthetic. This is not a live integration claim.
const h = await createDatabase("roster");
const date = "2026-11-16", nextDate = "2026-11-17";
const now = Date.parse(date + "T06:00:00+08:00");
let people = [
  { staffId: "alice", name: "Alice", active: true, eo: true, email: "alice@test.example" },
  { staffId: "bob", name: "Bob", active: false, eo: true, employment: "SRE", email: "bob@test.example" },
  { staffId: "unqualified", name: "Unqualified", active: false, eo: false, employment: "SRE" },
];
const publication = {
  schoolId: "s", publicationId: "publication", publicationSequence: 1,
  calculationVersion: "v1", rows: [{staffId: "alice", quality: "verified", budget: 4, Wi: 0, factor: 1}],
};
const env = {
  DB: h.db, ARTIFACTS: h.bucket, GSIS_SECRET: "synthetic-test-only", SCHOOL_ID: "s",
  CONTACTS: { async fetch() { return Response.json({people, revision: "contacts:1", asOf: now}); } },
  CALENDAR: { async fetch(request) {
    const {from, to} = await request.json(), rows = [];
    for (let d = from; d <= to; d = Allocation.addDays(d, 1)) rows.push({date: d, schoolDay: true, available: true});
    return Response.json({rows});
  } },
  DEPLOY: { async fetch() { return Response.json(publication); } },
};
const ctx = {
  env, now, body: {operation: "read", date},
  principal: {schoolId: "s", staffId: "alice", email: "alice@test.example", decisionId: "synthetic", capabilities: ["roster.write", "roster.admin"]},
};
const range = dates => ({from: dates[0], to: dates.at(-1), dates});
try {
  const activation = [{staffId: "typed", date, periods: [0, 2]}];
  assert(hasDatedReliefActivation({staffId: "typed", eo: true}, activation, date, 0));
  assert(hasDatedReliefActivation({id: "typed", eo: false, adhocEligible: true}, activation, date, 2));
  for (const person of [null, {}, {staffId: "typed", eo: "true"}, {staffId: "typed", employment: "SRE"}, {staffId: "other", eo: true, mobile: "same-mobile"}]) {
    assert.equal(hasDatedReliefActivation(person, activation, date, 2), false);
  }
  for (const period of [3, -1, 40, "2", NaN]) assert.equal(hasDatedReliefActivation({staffId: "typed", eo: true}, activation, date, period), false);
  for (const rows of [null, [{...activation[0], deletedAt: "deleted"}], [{...activation[0], periods: []}], [{...activation[0], periods: ["2"]}], [{...activation[0], periods: [40]}]]) {
    assert.equal(hasDatedReliefActivation({staffId: "typed", eo: true}, rows, date), false);
  }
  assert.equal(hasDatedReliefActivation({staffId: "typed", eo: true}, activation, nextDate), false);
  assert.equal(hasDatedReliefActivation({staffId: "typed", eo: true}, [{...activation[0], date: "2026-02-30"}], "2026-02-30"), false);
  for (const kind of ["relief_publication", "relief_reminder", "conditional_relief_instruction", "stapler_timetable", "mutual_request", "mutual_override"]) assert(isReliefNotificationKind(kind));
  for (const kind of ["smc_report", "lse_notice", "capacity_warning", "roster-email", null]) assert.equal(isReliefNotificationKind(kind), false);

  const cells = Array.from({length: 85}, () => ["", "", "", ""]);
  for (let day = 0; day < 5; day++) for (const p of [2, 3]) cells[day * 17 + p] = ["EL", "4A", "room", ""];
  const model = {
    layoutMode: "single-week", maxPeriod: 16, recesses: [],
    timing: {startMinutes: 420, periodMinutes: 30, endOfDayMinutes: 960},
    single: {days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], perDay: 17, maxPeriod: 16, blocks: [{name: "Alice", cells}]},
  };
  const artifact = await writeArtifact(h.bucket, "s", "baselines", model);
  await h.db.prepare("INSERT INTO roster_baselines(school_id,baseline_id,revision,name,from_date,to_date,priority,model_key,digest,mapping_json,pruned) VALUES(?,?,?,?,?,?,?,?,?,?,0)")
    .bind("s", "baseline", 1, "Synthetic baseline", date, "2026-11-20", 1, artifact.key, artifact.digest, canonical({Alice: "alice"})).run();
  const state = Operations.initial();
  state.adhoc.push({id: "bob-dated", staffId: "bob", date, periods: [2], employment: "SRE"});
  const loaded = {state, accountingRevisions: {}};
  const single = await context(ctx, loaded, range([date]), {needsQuota: true});
  const week = await context(ctx, loaded, range([date, nextDate]), {needsQuota: true});
  for (const c of [single, week]) {
    assert.equal(c.people.find(p => p.id === "bob").active, false, "dated relief must not rewrite Contacts employment activity");
    assert.equal(c.people.find(p => p.id === "alice").active, true, "active staff remain active");
    assert.deepEqual(Operations.dailyEmploymentView(state, c, {date}).snapshot.externalTeachers.map(p => p.staffId), ["bob"]);
    assert.match(Operations.view(state, c, {date, view: "adhoc"}).people.find(p => p.id === "bob").name, /\(ad hoc\)$/);
    assert.equal(Operations.dailyEmploymentView(state, c, {date}).people.some(p => p.id === "bob"), false, "inactive relief staff do not become report recipients");
  }
  const prospective = await context({...ctx, body: {operation: "saveAdhoc", staffId: "bob", date}}, {...loaded, state: {...state, adhoc: []}}, range([date]));
  assert.equal(prospective.people.find(p => p.id === "bob").active, false, "an uncommitted activation must not promote activity");

  for (const d of [date, nextDate]) Operations.apply(state, week, {operation: "saveAbsence", date: d, staffId: "alice", typeId: "mc", periods: [2, 3]});
  const demands = Operations.demand(single, state, date), demand2 = demands.find(d => d.period === 2), demand3 = demands.find(d => d.period === 3);
  const candidates = Operations.candidates(state, single, [demand2.id]);
  assert.equal(candidates.find(p => p.staffId === "bob").available, true);
  assert.equal(Operations.candidates(state, single, [demand3.id]).find(p => p.staffId === "bob").available, false);
  const manual = Allocation.manualModel(state, single, date);
  assert.deepEqual(manual.teachers.find(p => p.id === "bob").reliefActivePeriods, [2], "single-date model exposes only activated periods");
  assert(Allocation.manualRanks(manual, demand2).some(p => p.id === "bob"));
  assert(!Allocation.manualRanks(manual, demand3).some(p => p.id === "bob"));
  const assigned = structuredClone(state);
  Operations.apply(assigned, single, {operation: "assign", date, staffId: "bob", demandIds: [demand2.id]});
  const duty = Allocation.effectiveAssignments(assigned).find(a => a.staffId === "bob");
  assert(duty);
  duty.status = "published";
  duty.workloadReview = "Teacher is inactive in Contacts. Review this retained duty.";
  duty.reviewRequired = true;
  Operations.reconcile(assigned, single);
  assert.equal(duty.status, "published", "reconciliation preserves the published duty");
  assert(!duty.workloadReview?.includes("inactive"));
  const coverState = structuredClone(state), coverContext = {...single, days: structuredClone(single.days)};
  const coverCells = Array.from({length: 17}, () => ["", "", "", ""]);
  coverCells[2] = ["EL", "4A", "room", ""];
  coverContext.days[date].teachers.push({staffId: "bob", name: "Bob", cells: coverCells, R: 4});
  coverContext.baselineDays = coverContext.days;
  coverState.systemConfig.sharedSubjectCoverSubjects = ["EL"];
  Operations.reconcile(coverState, coverContext);
  assert(Allocation.effectiveAssignments(coverState).some(a => a.staffId === "bob" && a.period === 2 && a.origin === "shared-subject"), "dated inactive co-teacher can cover an existing shared lesson");
  assert.throws(() => Operations.apply(structuredClone(state), single, {operation: "assign", date, staffId: "bob", demandIds: [demand3.id]}), /inactive|activated periods/);
  assert.throws(() => Operations.apply(structuredClone(state), single, {operation: "assign", date, staffId: "missing", demandIds: [demand2.id]}), e => e.status === 404, "missing identity remains 404, not an inactive person");
  assert.throws(() => Operations.apply(structuredClone(state), single, {operation: "saveAbsence", date, staffId: "bob", typeId: "mc", periods: [2]}), /inactive/, "relief activation does not grant absence-report eligibility");
  const newActivation = structuredClone(state); newActivation.adhoc = [];
  Operations.apply(newActivation, prospective, {operation: "saveAdhoc", date, staffId: "bob", periods: [2]});
  assert.equal(newActivation.adhoc.length, 1);
  assert.throws(() => Operations.apply(structuredClone(state), single, {operation: "saveAdhoc", date, staffId: "unqualified", periods: [2]}), /not eligible/);

  const {snapshot, policyValue, weeklyWrites} = await allocationSnapshot(ctx, loaded, single, date, 0, "dated-test");
  assert.equal(snapshot.staff.find(p => p.staffId === "bob").active, false);
  assert.equal(snapshot.staff.find(p => p.staffId === "bob").dateActive, true);
  assert(weeklyWrites.every(write => write.args[1] !== "bob"), "dated activation does not capture long-term weekly entitlement");
  const withHistoricalBaseline = {...coverContext, publication: {...single.publication, rows: [...single.publication.rows, {staffId: "bob", quality: "verified", budget: 4, Wi: 0, factor: 1}]}};
  const capture = await allocationSnapshot(ctx, loaded, withHistoricalBaseline, date, 0, "inactive-baseline");
  assert(capture.weeklyWrites.every(write => write.args[1] !== "bob"), "inactive identity with a retained baseline also cannot acquire long-term entitlement");
  const proposal = runEngine(snapshot, policyValue, {mode: "fill-only"});
  assert.deepEqual(proposal.assignments.filter(a => a.staffId === "bob").map(a => a.period), [2]);
  const capacity = inspectCapacity(snapshot, policyValue, [2, 3]);
  assert(capacity.periods[0].green.includes("bob"));
  assert(!capacity.periods[1].green.includes("bob"));
  const health = await layeredHealth(ctx, loaded, single, date, 0, {periods: []});
  assert(health.periods.find(p => p.period === 2).green.includes("bob"));
  assert(!health.periods.find(p => p.period === 3).green.includes("bob"));
  const before = structuredClone(state);
  const forecast = await forecastCapacity(ctx, loaded, week, [date, nextDate], 0);
  assert.equal(forecast.days[0].planned, 1);
  assert.equal(forecast.days[1].planned, 0, "one-day activation supplies no next-day forecast capacity");
  assert.deepEqual(state, before);
  assert.deepEqual(await query(h.db, "SELECT * FROM roster_weekly"), [], "read-only health/forecast do not capture weekly writes");

  for (const [label, change] of [
    ["deleted", s => {s.adhoc[0].deletedAt = new Date(now).toISOString();}],
    ["wrong date", s => {s.adhoc[0].date = nextDate;}],
    ["different permanent ID", s => {s.adhoc[0].staffId = "bob-alias";}],
    ["absent activation", s => {s.adhoc = [];}],
  ]) {
    const denied = structuredClone(loaded); change(denied.state);
    const current = await context(ctx, denied, range([date]), {needsQuota: true});
    const value = await allocationSnapshot(ctx, denied, current, date, 0, "denied:" + label.replaceAll(" ", "-"));
    assert.equal(runEngine(value.snapshot, value.policyValue, {mode: "fill-only"}).assignments.some(a => a.staffId === "bob"), false, label);
    assert.equal(inspectCapacity(value.snapshot, value.policyValue, [2]).periods[0].green.includes("bob"), false, label);
    assert.throws(() => Operations.apply(structuredClone(denied.state), current, {operation: "assign", date, staffId: "bob", demandIds: [demand2.id]}), /inactive/, label);
  }
  people = people.map(p => p.staffId === "bob" ? {...p, eo: false, adhocEligible: false} : p);
  const revoked = await context(ctx, loaded, range([date]), {needsQuota: true});
  const denied = await allocationSnapshot(ctx, loaded, revoked, date, 0, "qualification-revoked");
  assert.equal(denied.snapshot.staff.find(p => p.staffId === "bob").dateActive, false);
  assert.equal(runEngine(denied.snapshot, denied.policyValue, {mode: "fill-only"}).assignments.some(a => a.staffId === "bob"), false);
  assert.equal(Operations.candidates(state, revoked, [demand2.id]).find(p => p.staffId === "bob").available, false, "employment tag cannot replace accepted qualification");
  people = people.map(p => p.staffId === "bob" ? {...p, adhocEligible: true} : p);
  const explicitlyEligible = await context(ctx, loaded, range([date]), {needsQuota: true});
  const explicit = await allocationSnapshot(ctx, loaded, explicitlyEligible, date, 0, "explicit-eligibility");
  assert.equal(explicit.snapshot.staff.find(p => p.staffId === "bob").eo, false);
  assert.equal(explicit.snapshot.staff.find(p => p.staffId === "bob").active, false);
  assert(runEngine(explicit.snapshot, explicit.policyValue, {mode: "fill-only"}).assignments.some(a => a.staffId === "bob" && a.period === 2), "explicit Contacts ad hoc eligibility remains a supported route");
  people = people.filter(p => p.staffId !== "bob");
  const missing = await context(ctx, loaded, range([date]), {needsQuota: true});
  assert.throws(() => Operations.apply(structuredClone(state), missing, {operation: "assign", date, staffId: "bob", demandIds: [demand2.id]}), e => e.status === 404);
  assert.throws(() => Operations.reconcile(structuredClone(assigned), missing), e => e.status === 404, "retained-duty reconciliation preserves the reviewed missing-person failure");
  console.log("PASS actual v1 context with local D1/R2: dated activity/report/label parity, manual and automatic period boundaries, retained duty, capacity/weekly forecast, missing/revoked identity and no authority promotion");
} finally {
  await h.close();
}
