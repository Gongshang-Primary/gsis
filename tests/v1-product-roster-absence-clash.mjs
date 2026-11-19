import assert from "node:assert/strict";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";

const f = await fixture();
try {
  const s = await seedScenario(f);
  for (const staffId of s.staff) {
    await f.call(f.admin, "contacts", `/staff/${staffId}/update`, {
      operationId: "clash-profile-" + staffId,
      changes: { role: "Teacher", employmentTags: [], subjectTags: [] },
      fieldRevisions: { role: 0, employmentTags: 0, subjectTags: 0 },
    });
  }
  const model = {
    ...s.model,
    maxPeriod: 3,
    timing: { startMinutes: 600, periodMinutes: 30, endOfDayMinutes: 720 },
    single: {
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      perDay: 4,
      maxPeriod: 3,
      blocks: s.staff.map((_, index) => ({
        name: "Synthetic Teacher " + (index ? "B" : "A"),
        cells: Array.from({ length: 20 }, (__, slot) =>
          !index && slot % 4 === 0
            ? ["Synthetic subject", "Synthetic class", "Synthetic Room A", ""]
            : ["", "", "", ""],
        ),
      })),
    },
  };
  await f.call(f.admin, "roster", "/upload", {
    ...s.payload,
    model,
    operationId: "clash-baseline",
  });

  // Also seed an ordinary non-SMC teacher account mapped to s.staff[1].
  const teacherOwn = await f.seedAccount("clash-teacher-own", {
    staffId: s.staff[1],
    capabilities: ["roster.own"],
  });
  const rosterDb = await f.db("roster");

  async function activeAbsences() {
    const rows = (
      await rosterDb
        .prepare(
          "SELECT record_id, payload_json FROM roster_records WHERE school_id=? AND collection='absences'",
        )
        .bind(schoolId)
        .all()
    ).results;
    return rows
      .map((r) => JSON.parse(r.payload_json).data)
      .filter((a) => !a.deletedAt);
  }
  async function allAbsences() {
    const rows = (
      await rosterDb
        .prepare(
          "SELECT record_id, payload_json FROM roster_records WHERE school_id=? AND collection='absences'",
        )
        .bind(schoolId)
        .all()
    ).results;
    return rows.map((r) => JSON.parse(r.payload_json).data);
  }

  // Case 1: Initial absence (period 0) and disjoint same-teacher/date absence (period 2) save immediately without confirmation.
  const first = await f.call(f.admin, "roster", "/operations", {
    operation: "saveAbsence",
    operationId: "clash-first-p0",
    date: s.date,
    revision: 0,
    staffId: s.staff[0],
    typeId: "mc",
    periods: [0],
    instructionsByDate: { [s.date]: { "0": "Retained history note for P0" } },
  });
  assert.equal(first.savedIds.length, 1);
  const firstId = first.savedIds[0];

  const disjoint = await f.call(f.admin, "roster", "/operations", {
    operation: "saveAbsence",
    operationId: "clash-disjoint-p2",
    date: s.date,
    revision: first.revision,
    staffId: s.staff[0],
    typeId: "mc",
    periods: [2],
  });
  assert.equal(disjoint.savedIds.length, 1);
  const disjointId = disjoint.savedIds[0];
  assert.equal((await activeAbsences()).length, 2);

  // Seed an assignment on the first absence and an unrelated completed assignment on the disjoint absence
  // to verify Case 9 (completed duties, instructions history, and unrelated allocations retained).
  await rosterDb
    .prepare(
      "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,'assignments',?,?,?, ?,1,?)",
    )
    .bind(
      schoolId,
      "asg-future-p0",
      s.date,
      s.staff[1],
      s.date.slice(0, 4),
      JSON.stringify({
        kind: "array",
        data: {
          id: "asg-future-p0",
          absenceId: firstId,
          date: s.date,
          period: 0,
          staffId: s.staff[1],
          status: "draft",
        },
      }),
    )
    .run();
  await rosterDb
    .prepare(
      "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,'assignments',?,?,?, ?,1,?)",
    )
    .bind(
      schoolId,
      "asg-completed-p0",
      s.date,
      s.staff[1],
      s.date.slice(0, 4),
      JSON.stringify({
        kind: "array",
        data: {
          id: "asg-completed-p0",
          absenceId: firstId,
          date: s.date,
          period: 0,
          staffId: s.staff[1],
          status: "completed",
          completedAt: new Date().toISOString(),
        },
      }),
    )
    .run();
  await rosterDb
    .prepare(
      "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,'assignments',?,?,?, ?,1,?)",
    )
    .bind(
      schoolId,
      "asg-unrelated-p2",
      s.date,
      s.staff[1],
      s.date.slice(0, 4),
      JSON.stringify({
        kind: "array",
        data: {
          id: "asg-unrelated-p2",
          absenceId: disjointId,
          date: s.date,
          period: 2,
          staffId: s.staff[1],
          status: "draft",
        },
      }),
    )
    .run();

  // Case 2: Overlapping absence (periods [0, 1]) returns 409 ABSENCE_CLASH_CONFIRM_REQUIRED with conflict details & conflictToken,
  // and writes NOTHING to D1 (Cancel preserves stored records and draft).
  const beforeCount = (await allAbsences()).length;
  const clashRes = await f.request(f.admin, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "saveAbsence",
      operationId: "clash-unconfirmed-p01",
      date: s.date,
      revision: disjoint.revision,
      staffId: s.staff[0],
      typeId: "others",
      reasonDetail: "Medical appointment",
      periods: [0, 1],
    },
  });
  assert.equal(clashRes.status, 409);
  assert.equal(clashRes.body.error.code, "ABSENCE_CLASH_CONFIRM_REQUIRED");
  assert.equal(clashRes.body.error.details.confirmationRequired, true);
  assert.equal(clashRes.body.error.details.conflicts.length, 1);
  assert.equal(clashRes.body.error.details.conflicts[0].id, firstId);
  const conflictToken1 = clashRes.body.error.details.conflictToken;
  assert.match(conflictToken1, /^[a-f0-9]{64}$/);
  assert.equal((await allAbsences()).length, beforeCount, "Cancel / unconfirmed clash must not write");

  // Case 4: Invalid replacement (missing reasonDetail for 'others') fails cleanly even with confirmReplace=true, leaving old rows intact.
  const invalidReplace = await f.request(f.admin, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "saveAbsence",
      operationId: "clash-invalid-replace",
      date: s.date,
      revision: disjoint.revision,
      staffId: s.staff[0],
      typeId: "others",
      reasonDetail: "",
      periods: [0, 1],
      confirmReplace: true,
      conflictToken: conflictToken1,
    },
  });
  assert.equal(invalidReplace.status, 400);
  assert.equal((await activeAbsences()).length, 2, "Invalid replacement must leave old rows intact");

  // Case 6: Unauthorized replacement (teacherOwn attempting to replace s.staff[0]'s absence) fails cleanly.
  const unauthReplace = await f.request(teacherOwn, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "saveAbsence",
      operationId: "clash-unauth-replace",
      date: s.date,
      revision: disjoint.revision,
      staffId: s.staff[0],
      typeId: "mc",
      periods: [0, 1],
      confirmReplace: true,
      conflictToken: conflictToken1,
    },
  });
  assert.ok([403, 503].includes(unauthReplace.status));
  assert.equal((await activeAbsences()).length, 2);

  // Case 5: Changed conflict set rejects stale conflictToken with 409 ABSENCE_CLASH_CHANGED and demands fresh acknowledgement.
  const staleToken = await f.request(f.admin, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "saveAbsence",
      operationId: "clash-stale-token",
      date: s.date,
      revision: disjoint.revision,
      staffId: s.staff[0],
      typeId: "others",
      reasonDetail: "Medical appointment",
      periods: [0, 1],
      confirmReplace: true,
      conflictToken: "0".repeat(64),
    },
  });
  assert.equal(staleToken.status, 409);
  assert.equal(staleToken.body.error.code, "ABSENCE_CLASH_CHANGED");
  assert.equal(staleToken.body.error.details.conflictChanged, true);

  // Case 3 + Case 7 + Case 9: Confirmed replacement supersedes ONLY conflicting firstId, keeps disjointId,
  // cancels only future draft assignment on firstId, keeps completed duty & unrelated assignment, retains history,
  // and exact operationId retry returns the same durable receipt without duplicate writes or notifications.
  const replaceOpId = "clash-confirmed-replace-1";
  const replacePayload = {
    operation: "saveAbsence",
    operationId: replaceOpId,
    date: s.date,
    revision: disjoint.revision,
    staffId: s.staff[0],
    typeId: "others",
    reasonDetail: "Medical appointment",
    periods: [0, 1],
    confirmReplace: true,
    conflictToken: conflictToken1,
  };
  const replaced = await f.call(f.admin, "roster", "/operations", replacePayload);
  assert.equal(replaced.confirmedReplacement, true);
  assert.deepEqual(replaced.replacedIds, [firstId]);
  assert.equal(replaced.savedIds.length, 1);
  const newAbsenceId = replaced.savedIds[0];

  // Case 7: Exact retry recovers original receipt with zero duplicates; concurrent stale-revision request rejected.
  const replacedReplay = await f.call(f.admin, "roster", "/operations", replacePayload);
  assert.equal(replacedReplay.receipt.operationId, replaceOpId);
  assert.deepEqual(replacedReplay.savedIds, [newAbsenceId]);

  const concurrentStale = await f.request(f.admin, "roster", "/operations", {
    method: "POST",
    body: {
      ...replacePayload,
      operationId: "clash-concurrent-second",
    },
  });
  assert.equal(concurrentStale.status, 409);

  // Verify Case 3 & Case 9 stored state in D1:
  const activeAfter = await activeAbsences();
  assert.equal(activeAfter.length, 2);
  assert.ok(activeAfter.some((a) => a.id === disjointId), "Disjoint absence must survive");
  assert.ok(activeAfter.some((a) => a.id === newAbsenceId), "Replacement absence must be active");
  assert.ok(!activeAfter.some((a) => a.id === firstId), "Conflicting absence must be superseded");

  const supersededRecord = (await allAbsences()).find((a) => a.id === firstId);
  assert.ok(supersededRecord.deletedAt, "Superseded absence retains history with deletedAt");
  assert.equal(supersededRecord.supersededByOperationId, replaceOpId);

  const assignmentRows = (
    await rosterDb
      .prepare("SELECT record_id, payload_json FROM roster_records WHERE school_id=? AND collection='assignments'")
      .bind(schoolId)
      .all()
  ).results;
  const byAsgId = new Map(
    assignmentRows.map((r) => [r.record_id, JSON.parse(r.payload_json).data]),
  );
  assert.equal(byAsgId.get("asg-future-p0").status, "cancelled", "Future draft cover for superseded absence cancelled");
  assert.equal(byAsgId.get("asg-completed-p0").status, "completed", "Completed duty preserved");
  assert.equal(byAsgId.get("asg-unrelated-p2").status, "draft", "Unrelated absence assignment preserved");

  // Case 8: Queued intake (intake: true) clash -> needsReview -> changed conflict -> retryAbsenceIntake refreshes token ->
  // resolveAbsenceIntake ('merge' with fresh token, and 'withdraw' on a second queued intake) with zero duplicate notifications.
  const intakeId = "intake-queued-1";
  const queued = await f.call(f.admin, "roster", "/operations", {
    operation: "saveAbsence",
    operationId: intakeId,
    intake: true,
    date: s.date,
    revision: replaced.revision,
    staffId: s.staff[0],
    typeId: "mc",
    periods: [1, 2],
  });
  assert.equal(queued.intakeReceipt, true);
  assert.equal(queued.intakeState, "needsReview");
  assert.equal(queued.absenceApplied, false);
  assert.equal(queued.conflicts.length, 2); // overlaps both newAbsenceId (p1) and disjointId (p2)
  const initialIntakeToken = queued.conflictToken;

  // Mutate one conflicting absence (add a new disjoint absence on period 3? Better: delete disjointId so conflict set shrinks!)
  const delDisjoint = await f.call(f.admin, "roster", "/operations", {
    operation: "deleteAbsences",
    operationId: "clash-del-disjoint",
    date: s.date,
    revision: queued.revision,
    confirm: true,
    ids: [disjointId],
  });
  assert.ok(delDisjoint.revision > queued.revision);

  // Attempting resolveAbsenceIntake('merge') with the OLD conflictToken must fail with 409 ABSENCE_CLASH_CHANGED!
  const staleResolve = await f.request(f.admin, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "resolveAbsenceIntake",
      operationId: "resolve-stale-1",
      intakeRequestId: intakeId,
      resolution: "merge",
      conflictToken: initialIntakeToken,
    },
  });
  assert.equal(staleResolve.status, 409);
  assert.equal(staleResolve.body.error.code, "ABSENCE_CLASH_CHANGED");
  assert.equal(staleResolve.body.error.details.conflicts.length, 1);

  // Calling retryAbsenceIntake without confirmReplace updates the durable intake record with the fresh conflictToken!
  const retried = await f.call(f.admin, "roster", "/operations", {
    operation: "retryAbsenceIntake",
    operationId: "retry-refresh-1",
    intakeRequestId: intakeId,
  });
  assert.equal(retried.intakeReceipt, true);
  assert.equal(retried.intakeState, "needsReview");
  assert.equal(retried.conflictChanged, true);
  assert.equal(retried.conflicts.length, 1);
  assert.equal(retried.conflicts[0].id, newAbsenceId);
  const freshIntakeToken = retried.conflictToken;
  assert.notEqual(freshIntakeToken, initialIntakeToken);

  // Now resolveAbsenceIntake('merge') with the fresh conflictToken applies atomically once!
  const outboxBefore = (
    await rosterDb
      .prepare("SELECT COUNT(*) AS c FROM product_outbox WHERE school_id=?")
      .bind(schoolId)
      .first()
  ).c;
  const resolvedOpId = "resolve-merge-ok-1";
  const resolved = await f.call(f.admin, "roster", "/operations", {
    operation: "resolveAbsenceIntake",
    operationId: resolvedOpId,
    intakeRequestId: intakeId,
    resolution: "merge",
    conflictToken: freshIntakeToken,
  });
  assert.equal(resolved.intakeReceipt, true);
  assert.equal(resolved.intakeState, "applied");
  assert.equal(resolved.absenceApplied, true);
  assert.equal(resolved.resolution, "merge");
  assert.deepEqual(resolved.replacedIds, [newAbsenceId]);
  assert.equal(resolved.savedIds.length, 1);

  const outboxAfterFirst = (
    await rosterDb
      .prepare("SELECT COUNT(*) AS c FROM product_outbox WHERE school_id=?")
      .bind(schoolId)
      .first()
  ).c;

  // Replaying retryAbsenceIntake after resolution returns idempotent alreadyApplied with zero duplicate absences or notifications!
  const retryAfterDone = await f.call(f.admin, "roster", "/operations", {
    operation: "retryAbsenceIntake",
    operationId: "retry-after-applied",
    intakeRequestId: intakeId,
  });
  assert.equal(retryAfterDone.alreadyApplied, true);
  assert.equal(retryAfterDone.absenceApplied, true);
  assert.equal(
    (
      await rosterDb
        .prepare("SELECT COUNT(*) AS c FROM product_outbox WHERE school_id=?")
        .bind(schoolId)
        .first()
    ).c,
    outboxAfterFirst,
    "Retry after applied must not queue duplicate notifications",
  );
  assert.ok(outboxAfterFirst >= outboxBefore);

  // Also verify resolveAbsenceIntake('withdraw') leaves existing absences untouched and preserves history.
  const intakeId2 = "intake-queued-2";
  const queued2 = await f.call(f.admin, "roster", "/operations", {
    operation: "saveAbsence",
    operationId: intakeId2,
    intake: true,
    date: s.date,
    revision: resolved.revision,
    staffId: s.staff[0],
    typeId: "mc",
    periods: [1],
  });
  assert.equal(queued2.intakeState, "needsReview");

  const withdrawn = await f.call(f.admin, "roster", "/operations", {
    operation: "resolveAbsenceIntake",
    operationId: "resolve-withdraw-2",
    intakeRequestId: intakeId2,
    resolution: "withdraw",
    reason: "Duplicate submission already covered.",
  });
  assert.equal(withdrawn.intakeReceipt, true);
  assert.equal(withdrawn.intakeState, "withdrawn");
  assert.equal(withdrawn.absenceApplied, false);
  assert.equal(withdrawn.resolution, "withdraw");
  assert.equal((await activeAbsences()).length, 1);

  console.log(
    "PASS v1 Roster absence clash confirmation (all 9 cases) + resolveAbsenceIntake + retryAbsenceIntake (F06)",
  );
} finally {
  await f.close();
}
