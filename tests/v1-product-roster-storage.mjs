import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import {
  canonical,
  query,
  one,
  prepareOperation,
  commitOperation,
} from "../v1/runtime/store.mjs";
import {
  loadState,
  recordChanges,
  scopeChange,
  scopeRevision,
} from "../v1/services/roster/repository.mjs";
import {
  completePublishedDuties,
  correctionPlan,
  dutiesReport,
  ledgerCSV,
} from "../v1/services/roster/ledger.mjs";
import Operations from "../shared/roster-operations.js";
import Stapler from "../shared/roster-stapler.js";
import fixture from "./roster701-fixture.cjs";
const h = await createDatabase("roster");
const now = Math.max(Date.now(), Date.parse("2026-11-13T18:00:00+08:00")),
  school = "s";
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log("PASS " + name);
}
async function save(opId, range, mutate, { expected, extraGuards = [] } = {}) {
  const loaded = await loadState(h.db, school, range),
    scope = "day:" + range.from,
    revision = await scopeRevision(h.db, school, scope);
  mutate(loaded.state);
  const changes = await recordChanges(
      school,
      loaded.before,
      loaded.state,
      loaded.records,
    ),
    sc = scopeChange(school, scope, expected ?? revision),
    op = await prepareOperation(h.db, {
      schoolId: school,
      actorId: "actor",
      operationId: opId,
      action: "roster.test",
      intent: { opId },
      now,
      validUntil: now + 10000,
    }),
    admission = await syntheticAdmission(h.db, op);
  return commitOperation(h.db, op, {
    now,
    admission,
    guards: [...changes.guards, sc.guard, ...extraGuards],
    writes: [...changes.writes, sc.write],
    result: { saved: true },
  });
}
try {
  await test("RO01 owner rows retain exact absence retry, latest replace and information-only instructions", async () => {
    const f = fixture();
    f.ctx.resubmission = true;
    f.ctx.intakeDeduplicate = true;
    f.ctx.attendanceOnly = true;
    const range = { from: f.date, to: f.date };
    await save("abs1", range, (s) =>
      Operations.apply(s, f.ctx, {
        operation: "saveAbsence",
        staffId: "alice",
        date: f.date,
        typeId: "mc",
        periods: [2, 3],
        instructionsNA: false,
      }),
    );
    const first = (await loadState(h.db, school, range)).state.absences[0];
    assert(first);
    assert.equal(first.instructionsNA, false);
    await save("abs2", range, (s) =>
      Operations.apply(s, f.ctx, {
        operation: "saveAbsence",
        staffId: "alice",
        date: f.date,
        typeId: "mc",
        periods: [2, 3],
      }),
    );
    const second = (await loadState(h.db, school, range)).state.absences.filter(
      (a) => !a.deletedAt,
    );
    assert.equal(second.length, 1);
    assert.equal(second[0].id, first.id);
    f.ctx.iso = new Date(f.ctx.now + 1000).toISOString();
    f.ctx.now += 1000;
    await save("abs3", range, (s) =>
      Operations.apply(s, f.ctx, {
        operation: "saveAbsence",
        staffId: "alice",
        date: f.date,
        typeId: "mc",
        periods: [2],
      }),
    );
    const latest = (await loadState(h.db, school, range)).state.absences.filter(
      (a) => !a.deletedAt,
    );
    assert(latest.some((a) => a.periods.length === 1 && a.periods[0] === 2));
  });
  await test("RO02 accepted peer/manual commitments persist with protection through independent changes", async () => {
    const range = { from: "2026-11-13", to: "2026-11-13" };
    await save("peer-seed", range, (s) => {
      s.assignments.push({
        id: "protected",
        staffId: "peer",
        date: range.from,
        demandId: "d",
        period: 2,
        origin: "mutual",
        status: "published",
        protected: true,
        rCost: 1,
      });
      s.requests.push({
        id: "peer-request",
        recipientId: "peer",
        date: range.from,
        status: "approved",
        demandIds: ["d"],
        periods: [2],
      });
    });
    await save("otherdate", { from: "2026-11-14", to: "2026-11-14" }, (s) =>
      s.adhoc.push({
        id: "adhoc",
        date: "2026-11-14",
        staffId: "x",
        periods: [2],
      }),
    );
    const state = (await loadState(h.db, school, range)).state;
    assert.equal(
      state.assignments.find((a) => a.id === "protected").protected,
      true,
    );
    assert.equal(state.requests[0].status, "approved");
  });
  await test("RO03 confirmed Stapler snapshot survives baseline pruning and process restart", async () => {
    const f = fixture(),
      range = { from: f.date, to: f.date },
      plan = Stapler.create(
        { ...f.ctx.days[f.date], date: f.date, formClasses: [] },
        { date: f.date, venues: [] },
      );
    await save("stapler", range, (s) => {
      Operations.staplerApply(s, f.ctx, {
        operation: "saveStapler",
        date: f.date,
        staplerRevision: 0,
        plan,
      });
      Operations.staplerApply(s, f.ctx, {
        operation: "confirmStapler",
        date: f.date,
        staplerRevision: 1,
      });
    });
    await h.restart();
    const state = (await loadState(h.db, school, range)).state,
      empty = {
        ...f.ctx,
        days: {
          [f.date]: {
            id: null,
            periods: [],
            teachers: [],
            verified: true,
            schoolDay: true,
          },
        },
        baselineDays: {},
      };
    assert.equal(
      Operations.effectiveTimetableDay(state, empty, f.date).teachers[0]
        .cells[2][0],
      "EL",
    );
  });
  await test("RO04 stale same-day CAS rolls back all records and outbox; disjoint dates succeed", async () => {
    const range = { from: "2026-11-15", to: "2026-11-15" };
    const a = await save(
      "raceA",
      range,
      (s) =>
        s.adhoc.push({ id: "a", date: range.from, staffId: "a", periods: [1] }),
      { expected: 0 },
    );
    assert.equal(a.state, "committed");
    await assert.rejects(
      save(
        "raceB",
        range,
        (s) =>
          s.adhoc.push({
            id: "b",
            date: range.from,
            staffId: "b",
            periods: [1],
          }),
        { expected: 0 },
      ),
      (e) => e.code === "REVISION_CONFLICT",
    );
    assert(
      !(await loadState(h.db, school, range)).state.adhoc.some(
        (a) => a.id === "b",
      ),
    );
    await Promise.all(
      ["2026-11-16", "2026-11-17"].map((date, i) =>
        save(
          "disjoint" + i,
          { from: date, to: date },
          (s) =>
            s.adhoc.push({
              id: "independent" + i,
              date,
              staffId: "t",
              periods: [2],
            }),
          { expected: 0 },
        ),
      ),
    );
  });
  await test("LED01 assumed completion unique across concurrent job and republication; explicit correction appends reversal", async () => {
    const duty = {
        dutyId: "duty-one",
        staffId: "teacher",
        date: "2026-11-13",
        period: 2,
        endAt: now - 1000,
        charge: 1,
        status: "published",
        publicationId: "pub1",
        origin: "manual",
      },
      payload = { duties: [duty] };
    await h.db
      .prepare("INSERT INTO roster_publications VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(
        school,
        "pub1",
        duty.date,
        1,
        "publish1",
        "digest",
        "key",
        canonical(payload),
        now - 10000,
      )
      .run();
    await h.db
      .prepare("INSERT INTO roster_publications VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(
        school,
        "pub2",
        duty.date,
        2,
        "publish2",
        "digest",
        "key",
        canonical({ duties: [{ ...duty, publicationId: "pub2" }] }),
        now - 5000,
      )
      .run();
    await h.db
      .prepare("INSERT INTO roster_duties VALUES(?,?,?,?,?,?,?,0)")
      .bind(
        school,
        duty.dutyId,
        duty.date,
        duty.endAt,
        "pub2",
        2,
        canonical({ ...duty, publicationId: "pub2" }),
      )
      .run();
    await Promise.all([
      completePublishedDuties({ DB: h.db }, school, now),
      completePublishedDuties({ DB: h.db }, school, now),
    ]);
    assert.equal(
      (
        await query(h.db, "SELECT * FROM roster_ledger WHERE duty_id=?", [
          "duty-one",
        ])
      ).length,
      1,
    );
    const body = {
        operationId: "correction",
        dutyId: duty.dutyId,
        correctionRevision: 0,
        completed: false,
        reason: "Owner confirmed duty did not occur.",
      },
      principal = { actorId: "admin" },
      plan = await correctionPlan(h.db, school, body, principal, now),
      op = await prepareOperation(h.db, {
        schoolId: school,
        actorId: "admin",
        operationId: body.operationId,
        action: "roster.correct",
        intent: body,
        now,
        validUntil: now + 10000,
      }),
      admission = await syntheticAdmission(h.db, op);
    await commitOperation(h.db, op, { now, admission, ...plan });
    const report = await dutiesReport(
      h.db,
      school,
      { from: duty.date, to: duty.date },
      { staffId: "teacher", capabilities: ["roster.own"] },
      now,
    );
    assert.equal(report.totals[0].periods, 0);
    assert.equal(report.totals[0].charge, 0);
    assert.equal(report.duties.length, 3);
    await completePublishedDuties({ DB: h.db }, school, now);
    assert.equal(
      (
        await query(h.db, "SELECT * FROM roster_ledger WHERE duty_id=?", [
          "duty-one",
        ])
      ).length,
      3,
    );
  });
  await test("LED02 inclusive cross-year totals, openings granular limits, export and own-only privacy", async () => {
    await h.db
      .prepare("INSERT INTO roster_ledger VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(
        school,
        "past",
        0,
        "teacher",
        "2025-12-31",
        3,
        1,
        0,
        "assumed-after-end",
        canonical({ date: "2025-12-31", staffId: "teacher" }),
        "system",
        "Published",
        "past-op",
        now,
      )
      .run();
    await h.db
      .prepare("INSERT INTO roster_openings VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(
        school,
        "teacher",
        "2025",
        1,
        "2025-06-30",
        9,
        9,
        "source",
        "opening-op",
      )
      .run();
    const principal = { staffId: "teacher", capabilities: ["roster.own"] },
      report = await dutiesReport(
        h.db,
        school,
        { from: "2025-12-31", to: "2026-11-13" },
        principal,
        now,
      );
    assert.equal(report.totals[0].periods, 1);
    assert.equal(report.openingBalances[0].included, false);
    assert.match(ledgerCSV(report), /2025-12-31/);
    await assert.rejects(
      dutiesReport(h.db, school, { staffId: "someone-else" }, principal, now),
      (e) => e.code === "CAPABILITY_DENIED",
    );
    const foreign = await dutiesReport(
      h.db,
      "other",
      { from: "2025-01-01", to: "2026-12-31" },
      { capabilities: ["admin"] },
      now,
    );
    assert.equal(foreign.duties.length, 0);
  });
  console.log(`${count} Roster persistence acceptance groups passed`);
} finally {
  await h.close();
}
