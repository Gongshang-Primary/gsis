import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { handle, internal } from "../v1/services/layout/service.mjs";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";

// Part 1: Direct Layout D1 + R2 timed-source adoption, ISH-1A/1B grouping, separate sequence ordering,
// coverage bounds, privacy boundary, and R2 tamper detection.
{
  const runtime = await createDatabase("layout");
  try {
    const now = Date.now();
    const date = "2026-11-23";
    const start = Date.parse(`${date}T08:00:00+08:00`);
    const end = start + 30 * 60000;
    const proofs = new Map();
    const env = {
      DB: runtime.db,
      ARTIFACTS: runtime.bucket,
      SCHOOL_ID: schoolId,
      SERVICE_NAME: "layout",
      GSIS_SECRET: "local-test-only",
      ROSTER: {
        async fetch(r) {
          const body = await r.json();
          return Response.json({ ok: true, data: proofs.get(body.operationId) });
        },
      },
    };
    const principal = {
      schoolId,
      actorId: "layout-reader",
      staffId: "staff-1",
      capabilities: ["layout.read", "layout.edit"],
      decisionId: "dec-layout-1",
      validUntil: now + 3600000,
    };

    // 1. Adopt timed source (sequence 3) with ZERO Deploy publication present!
    proofs.set("roster-base-3", {
      schoolId,
      state: "committed",
      operationId: "roster-base-3",
      digest: "digest-base-3",
      fence: 1,
      projection: {
        sourceKind: "baseline",
        revision: 3,
        coverage: {
          from: "2026-11-23",
          to: "2026-11-27",
          venueIds: ["ish-1"],
          periods: [{ id: "P1", start: 480, end: 510 }],
        },
        occupancies: [
          {
            venueId: "ish-1",
            sourceId: "lesson-ish-1a",
            sourceLabel: "ISH-1A",
            start,
            end,
            subject: "PE",
            className: "4A",
            mobile: "91234567", // private field that MUST be stripped!
          },
          {
            venueId: "ish-1",
            sourceId: "lesson-ish-1b",
            sourceLabel: "ISH-1B",
            start,
            end,
            subject: "PE",
            className: "4B",
            email: "private@example.invalid", // private field that MUST be stripped!
          },
        ],
      },
    });

    const adopted = await internal({
      env,
      path: "/internal/adopt-timed-source",
      method: "POST",
      body: {
        schoolId,
        sourceDomain: "roster",
        sourceOperationId: "roster-base-3",
        sourceDigest: "digest-base-3",
        year: 2026,
      },
      now,
    });
    assert.equal(adopted.state, "adopted");
    assert.equal(adopted.sequence, 3);
    assert.equal(adopted.lessonCount, 2);

    // Idempotent replay returns adopted cleanly.
    const replay = await internal({
      env,
      path: "/internal/adopt-timed-source",
      method: "POST",
      body: {
        schoolId,
        sourceDomain: "roster",
        sourceOperationId: "roster-base-3",
        sourceDigest: "digest-base-3",
        year: 2026,
      },
      now,
    });
    assert.equal(replay.state, "adopted");
    assert.equal(replay.revision, adopted.revision);

    // Delayed older timed import (sequence 2) is ignored and cannot roll back sequence 3!
    proofs.set("roster-base-2", {
      schoolId,
      state: "committed",
      operationId: "roster-base-2",
      digest: "digest-base-2",
      fence: 1,
      projection: {
        sourceKind: "baseline",
        revision: 2,
        coverage: { from: "2026-11-23", to: "2026-11-27", venueIds: ["ish-1"], periods: [] },
        occupancies: [],
      },
    });
    const stale = await internal({
      env,
      path: "/internal/adopt-timed-source",
      method: "POST",
      body: {
        schoolId,
        sourceDomain: "roster",
        sourceOperationId: "roster-base-2",
        sourceDigest: "digest-base-2",
        year: 2026,
      },
      now,
    });
    assert.equal(stale.state, "ignored");
    assert.equal(stale.activeSequence, 3);

    // 2. Read GET /timetable for covered date: ISH-1 appears ONCE with BOTH concurrent lessons and raw A/B labels; no private staff fields!
    const view = await handle({
      env,
      principal,
      path: `/timetable?year=2026&date=${date}`,
      method: "GET",
      body: { year: "2026", date },
      now,
    });
    assert.equal(view.covered, true);
    assert.equal(view.planningSource, null, "Works independently without Deploy publication");
    assert.equal(view.timedSource.sourceOperationId, "roster-base-3");
    assert.equal(view.venues.length, 1, "ISH-1 must appear once, not duplicated as two rooms");
    assert.equal(view.venues[0].venueId, "ish-1");
    assert.deepEqual(view.venues[0].sourceLabels, ["ISH-1A", "ISH-1B"]);
    assert.equal(view.venues[0].lessons.length, 2);
    const serialized = JSON.stringify(view);
    assert.ok(!serialized.includes("91234567"), "Private mobile must not appear in Layout projection");
    assert.ok(!serialized.includes("private@example.invalid"), "Private email must not appear in Layout projection");

    // 3. Date outside verified coverage returns covered: false and zero fabricated occupancy.
    const uncovered = await handle({
      env,
      principal,
      path: "/timetable?year=2026&date=2026-12-15",
      method: "GET",
      body: { year: "2026", date: "2026-12-15" },
      now,
    });
    assert.equal(uncovered.covered, false);
    assert.equal(uncovered.venues.length, 0);

    // 4. Tampered R2 timed-source artifact fails closed with 503 TIMED_SOURCE_CORRUPT.
    const headRow = await runtime.db
      .prepare(
        "SELECT value_json FROM layout_rows WHERE school_id=? AND year=2026 AND table_name='timed_source' AND row_id='head'",
      )
      .bind(schoolId)
      .first();
    const headData = JSON.parse(headRow.value_json);
    await runtime.bucket.put(headData.objectKey, '{"corrupt":true}');
    await assert.rejects(
      () =>
        handle({
          env,
          principal,
          path: `/timetable?year=2026&date=${date}`,
          method: "GET",
          body: { year: "2026", date },
          now,
        }),
      (e) => e.status === 503 && e.code === "TIMED_SOURCE_CORRUPT",
    );
  } finally {
    await runtime.close();
  }
}

// Part 2: End-to-end Roster baseline upload queues durable roster-layout-timed outbox intent without Deploy.
{
  const f = await fixture();
  try {
    const s = await seedScenario(f);
    for (const staffId of s.staff) {
      await f.call(f.admin, "contacts", `/staff/${staffId}/update`, {
        operationId: "lt-profile-" + staffId,
        changes: { role: "Teacher", employmentTags: [], subjectTags: [] },
        fieldRevisions: { role: 0, employmentTags: 0, subjectTags: 0 },
      });
    }
    const uploaded = await f.call(f.admin, "roster", "/upload", {
      ...s.payload,
      operationId: "lt-baseline-1",
    });
    assert.ok(uploaded.id);
    const rosterDb = await f.db("roster");
    const layoutJob = await rosterDb
      .prepare(
        "SELECT job_id, type, state, payload_json FROM product_outbox WHERE school_id=? AND type='roster-layout-timed'",
      )
      .bind(schoolId)
      .first();
    assert.ok(layoutJob, "Roster baseline upload must queue durable roster-layout-timed delivery intent");
    assert.equal(layoutJob.state, "queued");
    const payload = JSON.parse(layoutJob.payload_json);
    assert.equal(payload.sourceOperationId, "lt-baseline-1");
  } finally {
    await f.close();
  }
}

console.log(
  "PASS v1 Layout separate timed-source adoption, ISH-1A/1B grouping, monotonic ordering, coverage bounds and Roster baseline delivery intent",
);
