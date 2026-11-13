import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import { prepareOperation, one, query, digest } from "../v1/runtime/store.mjs";
import { handle, policy } from "../v1/services/calendar/service.mjs";
const runtime = await createDatabase("calendar");
let n = 0;
const principal = {
  schoolId: "test-school",
  actorId: "account-admin",
  staffId: "staff-admin",
  sessionId: "session",
  capabilities: ["calendar.admin"],
  decisionId: "synthetic-calendar",
  validUntil: Date.now() + 3600000,
};
const ctx = (action, p = {}, who = principal) => ({
  env: {
    DB: runtime.db,
    ARTIFACTS: runtime.bucket,
    SCHOOL_ID: "test-school",
    SERVICE_NAME: "calendar",
  },
  request: new Request("https://gsis.test/api/calendar/action"),
  path: "/action",
  method: "POST",
  body: { action, payload: p },
  principal: who,
  now: Date.now(),
  requestId: `r${++n}`,
});
async function mutate(action, p, who = principal) {
  const input = { ...p, operationId: p.operationId || crypto.randomUUID() };
  const c = ctx(action, input, who);
  const op = await prepareOperation(runtime.db, {
    schoolId: who.schoolId,
    actorId: who.actorId,
    operationId: input.operationId,
    action: `calendar.${action}`,
    intent: { action, payload: input },
    now: c.now,
    validUntil: who.validUntil,
    authorization: who,
  });
  await syntheticAdmission(runtime.db, op, { decisionId: who.decisionId });
  return handle(c);
}
try {
  await mutate("saveYear", {
    Year: 2026,
    Status: "ACTIVE",
    ReleasedToTeachers: "No",
    expectedMetadataRevision: "missing",
  });
  const initial = await handle(ctx("bootstrap", { year: 2026 }));
  assert.equal(initial.events.length, 0);
  assert.equal(initial.years[0]._revision, 1);
  const payload = {
    event: {
      Year: 2026,
      StaffTitle: "Science lesson",
      StartDate: "2026-11-16",
      EndDate: "2026-11-16",
      EventType: "TIMED",
      StartTime: "09:00",
      EndTime: "10:00",
      Status: "HIDDEN",
      LaneID: "day",
    },
    operationId: crypto.randomUUID(),
  };
  const first = await mutate("saveEvent", payload);
  assert.equal(first.event.StaffTitle, "Science lesson");
  const replay = await mutate("saveEvent", payload);
  assert.deepEqual(replay, first);
  assert.equal(
    (await query(runtime.db, "SELECT * FROM calendar_events")).length,
    1,
  );
  const teacher = {
    ...principal,
    actorId: "teacher",
    staffId: "teacher-staff",
    capabilities: ["calendar.read"],
  };
  await assert.rejects(
    () => handle(ctx("bootstrap", { year: 2026 }, teacher)),
    (e) => e.code === "YEAR_UNAVAILABLE",
  );
  await assert.rejects(
    () =>
      handle(
        ctx(
          "saveEvent",
          { ...payload, operationId: crypto.randomUUID() },
          teacher,
        ),
      ),
    (e) => e.code === "CAPABILITY_DENIED",
  );
  await assert.rejects(
    () =>
      handle(ctx("saveEvent", payload, { ...principal, impersonating: true })),
    (e) => e.code === "IMPERSONATION_DENIED",
  );
  const published = await mutate("publishVersion", { year: 2026, revision: 2 });
  assert.equal(published.published, 1);
  const visible = await handle(ctx("bootstrap", { year: 2026 }, teacher));
  assert.equal(visible.events.length, 1);
  const parent = {
    ...principal,
    actorId: "publisher",
    capabilities: ["calendar.parent.edit"],
  };
  const current = visible.events[0];
  await mutate(
    "saveParentSide",
    {
      eventId: current.EventID,
      expectedRevision: current._revision,
      ParentEnabled: "Yes",
      ParentTitle: "Parent event",
    },
    parent,
  );
  await assert.rejects(
    () =>
      mutate(
        "saveParentSide",
        {
          eventId: current.EventID,
          expectedRevision: current._revision + 1,
          StaffTitle: "steal",
        },
        parent,
      ),
    (e) => e.code === "FIELD_DENIED",
  );
  const changed = {
    ...payload.event,
    EventID: current.EventID,
    StaffTitle: "Changed title",
  };
  const contenders = await Promise.allSettled([
    mutate("saveEvent", { event: changed, expectedRevision: 3 }),
    mutate("saveEvent", {
      event: { ...changed, StaffTitle: "Other title" },
      expectedRevision: 3,
    }),
  ]);
  assert.equal(contenders.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(contenders.filter((r) => r.status === "rejected").length, 1);
  const pub = await one(
    runtime.db,
    "SELECT data_json FROM calendar_publications WHERE publication_id=?",
    [published.publicationId],
  );
  assert.equal(
    JSON.parse(pub.data_json).events[0].StaffTitle,
    "Science lesson",
  );
  const latest = await one(
    runtime.db,
    "SELECT * FROM calendar_events WHERE event_id=?",
    [current.EventID],
  );
  await mutate("deleteEvent", {
    eventId: current.EventID,
    expectedRevision: latest.revision,
  });
  const tombstones = await query(
    runtime.db,
    "SELECT * FROM calendar_sync WHERE event_id=?",
    [current.EventID],
  );
  assert(tombstones.every((r) => r.tombstone === 1));
  await runtime.restart();
  const after = await handle(ctx("bootstrap", { year: 2026 }));
  assert.equal(after.events.length, 0);
  assert.equal(after.pendingRemovals.length, 1);
  assert.equal(
    (await query(runtime.db, "SELECT * FROM calendar_publications")).length,
    1,
  );
  const foreign = await handle(
    ctx("bootstrap", {}, { ...principal, schoolId: "other-school" }),
  );
  assert.equal(foreign.events.length, 0);
  assert.equal(foreign.years.length, 0);
  assert.throws(
    () => policy("POST", "/action", { action: "invented" }),
    (e) => e.code === "NOT_FOUND",
  );
  console.log(
    "PASS Calendar real D1: durable event/retry, release/audience, parent-field boundary, impersonation denial, CAS race, immutable publication, tombstone/restart, school isolation. Synthetic storage admission; integrated Core authentication is separate.",
  );
} finally {
  await runtime.close();
}
