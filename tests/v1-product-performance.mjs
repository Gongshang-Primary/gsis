import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { productSuite } from "./v1-product/suite.mjs";
import { runEngine, defaultPolicy } from "../v1/allocator/index.mjs";
const suite = await productSuite();
try {
  const db = await suite.db("contacts"),
    now = Date.now(),
    school = "synthetic-school";
  for (let start = 0; start < 200; start += 40)
    await db.batch(
      Array.from({ length: 40 }, (_, i) => {
        const n = start + i;
        return db
          .prepare(
            "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,active,section,profile_state,revision,created_at) VALUES(?,?,?,?,1,'primary','complete',1,?)",
          )
          .bind(school, "staff-" + n, "Synthetic " + n, "Synthetic " + n, now);
      }),
    );
  const users = [];
  for (let n = 0; n < 30; n++)
    users.push(await suite.seedAccount("load-user-" + n));
  for (let n = 0; n < 3; n++)
    assert.equal(
      (await suite.request(users[0], "contacts", "/bootstrap")).status,
      200,
    );
  const measurements = await Promise.all(
    users.map(async (user) => {
      const start = performance.now();
      const response = await suite.request(user, "contacts", "/bootstrap");
      return { ms: performance.now() - start, status: response.status };
    }),
  );
  assert(
    measurements.every((r) => r.status === 200),
    "all 30 independent authenticated sessions load school directory",
  );
  const writeMeasurements = await Promise.all(
    users.map(async (user, n) => {
      const start = performance.now();
      const response = await suite.request(user, "contacts", "/staff/create", {
        method: "POST",
        body: {
          operationId: "load-create-" + n,
          staffId: "load-created-" + n,
          basicName: "Load Created " + n,
        },
      });
      return { ms: performance.now() - start, status: response.status };
    }),
  );
  assert(
    writeMeasurements.every((r) => r.status === 200),
    JSON.stringify(writeMeasurements),
  );
  const writeValues = writeMeasurements.map((r) => r.ms).sort((a, b) => a - b);
  const roster = await suite.db("roster");
  for (let offset = 0; offset < 3650; offset += 50)
    await roster.batch(
      Array.from({ length: Math.min(50, 3650 - offset) }, (_, i) => {
        const n = offset + i,
          date = new Date(Date.UTC(2026, 0, 1) + Math.floor(n / 10) * 86400000)
            .toISOString()
            .slice(0, 10);
        return roster
          .prepare(
            "INSERT INTO roster_ledger(school_id,duty_id,correction_revision,staff_id,service_date,period,period_count,charge,completion_basis,assignment_json,actor_id,reason,operation_id,recorded_at) VALUES(?,?,0,?,?,?,1,1,?,?,?, ?,?,?)",
          )
          .bind(
            school,
            "year-duty-" + n,
            "staff-" + (n % 200),
            date,
            n % 17,
            "assumed-after-end",
            JSON.stringify({
              staffId: "staff-" + (n % 200),
              period: n % 17,
              date,
              source: "synthetic-odd-even-baseline",
            }),
            "synthetic-scheduler",
            "Synthetic load fixture",
            "year-op-" + n,
            now,
          );
      }),
    );
  const ledgerStart = performance.now(),
    yearReport = await suite.request(
      users[0],
      "roster",
      "/duties?from=2026-01-01&to=2026-12-31",
    );
  const ledgerMs = performance.now() - ledgerStart;
  assert.equal(yearReport.status, 200, JSON.stringify(yearReport.body));
  assert.equal(yearReport.body.data.duties.length, 3650);
  assert.equal(
    yearReport.body.data.totals.reduce((a, r) => a + r.periods, 0),
    3650,
  );
  const values = measurements.map((r) => r.ms).sort((a, b) => a - b),
    percentile = (p) =>
      values[Math.min(values.length - 1, Math.ceil(p * values.length) - 1)];
  const staff = Array.from({ length: 200 }, (_, i) => ({
    staffId: "teacher-" + i,
    active: true,
    eo: true,
    hasBaseline: true,
    employment: i < 20 ? "FAJT" : "Full-time",
    occupied: [
      { period: i % 17, subject: "EL" },
      { period: (i + 5) % 17, subject: "MA" },
    ],
    available: Array.from({ length: 17 }, (_, p) => p).filter(
      (p) => p !== i % 17 && p !== (i + 5) % 17,
    ),
    weekly: { quality: "verified", remaining: 12 },
    subjects: ["EL"],
    levels: [1, 2, 3, 4, 5, 6],
  }));
  const demands = Array.from({ length: 50 }, (_, i) => ({
    id: "demand-" + i,
    lessonId: "lesson-" + i,
    period: i % 17,
    subject: "EL",
    level: (i % 6) + 1,
    classId: "class-" + (i % 40),
  }));
  const start = performance.now();
  const proposal = runEngine(
    {
      schemaVersion: 1,
      schoolId: school,
      runId: "load-test",
      date: "2026-11-13",
      observedAt: now,
      inputDigest: "synthetic-200-staff",
      revisions: { day: 1, config: 1 },
      staff,
      demands,
      assignments: [],
    },
    defaultPolicy(),
  );
  const engineMs = performance.now() - start;
  assert.equal(
    proposal.assignments.length + proposal.unresolved.length,
    demands.length,
  );
  assert.equal(
    new Set(proposal.assignments.map((a) => a.demandId)).size,
    proposal.assignments.length,
  );
  assert(
    engineMs < 10000,
    "representative allocator produces useful bounded result within 10 seconds",
  );
  const highStart = performance.now(),
    highDemands = Array.from({ length: 150 }, (_, i) => ({
      ...demands[i % 50],
      id: "high-" + i,
      lessonId: "high-lesson-" + i,
      classId: "class-" + (i % 40),
    }));
  const high = runEngine(
    {
      schemaVersion: 1,
      schoolId: school,
      runId: "high-absence",
      date: "2026-11-13",
      observedAt: now,
      inputDigest: "synthetic-high-absence",
      revisions: { day: 1, config: 1 },
      staff,
      demands: highDemands,
      assignments: [],
    },
    defaultPolicy(),
  );
  const highMs = performance.now() - highStart;
  assert.equal(high.assignments.length + high.unresolved.length, 150);
  const evidence = {
    schemaVersion: 1,
    runtime: process.version,
    dataset: {
      staff: 200,
      classes: 40,
      periods: 17,
      demands: 50,
      authenticatedSessions: 30,
      calendarYearDutyRows: 3650,
      concurrentWrites: 30,
      highAbsenceDemands: 150,
    },
    measurement:
      "warm HTTP gateway / Contacts list; local actual Workers D1, no live network",
    requests: {
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: values.at(-1),
      errors: measurements.filter((r) => r.status !== 200).length,
      targetP95: 1000,
      meetsTarget: percentile(0.95) <= 1000,
    },
    writes: {
      p50: writeValues[14],
      p95: writeValues[28],
      max: writeValues.at(-1),
      errors: writeMeasurements.filter((r) => r.status !== 200).length,
      targetP95: 2000,
      meetsTarget: writeValues[28] <= 2000,
    },
    yearLedger: { milliseconds: ledgerMs, rows: 3650 },
    highAbsence: {
      milliseconds: highMs,
      assigned: high.assignments.length,
      unresolved: high.unresolved.length,
    },
    allocator: {
      milliseconds: engineMs,
      assigned: proposal.assignments.length,
      unresolved: proposal.unresolved.length,
    },
    notMeasured: [
      "production region/network",
      "30 full browser pages concurrently",
    ],
  };
  await mkdir("deliverables/v1/evidence", { recursive: true });
  await writeFile(
    "deliverables/v1/evidence/performance.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  await suite.close();
}
