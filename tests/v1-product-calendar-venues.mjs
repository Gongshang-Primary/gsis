import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import { prepareOperation, query } from "../v1/runtime/store.mjs";
import { handle } from "../v1/services/calendar/service.mjs";

const runtime = await createDatabase("calendar");
const principal = {
  schoolId: "synthetic-school", actorId: "calendar-admin", staffId: "staff-admin",
  sessionId: "session", capabilities: ["calendar.admin"],
  decisionId: "synthetic-calendar-venues", validUntil: Date.now() + 3600000,
};
const rooms = Array.from({ length: 7 }, (_, i) => ({ id: `room-${i + 1}` }));
let unavailable = false, catalogueReads = 0;
function context(action, payload, who = principal) {
  return {
    env: {
      DB: runtime.db, ARTIFACTS: runtime.bucket, SCHOOL_ID: principal.schoolId,
      SERVICE_NAME: "calendar", GSIS_SECRET: "synthetic-only",
      VENUES: { async fetch(request) {
        catalogueReads++;
        const input = await request.json();
        assert.equal(input.schoolId, who.schoolId);
        assert.equal(input.decisionId, who.decisionId);
        assert.equal(input.purpose, "calendar");
        assert.equal(new URL(request.url).pathname, "/internal/catalogue");
        if (unavailable) throw Error("Synthetic provider unavailable");
        return Response.json({ ok: true, data: { schoolId: who.schoolId, venues: rooms } });
      } },
    },
    request: new Request("https://synthetic.invalid/api/calendar/action"),
    path: "/action", method: "POST", body: { action, payload },
    principal: who, now: Date.now(), requestId: crypto.randomUUID(),
  };
}
async function mutate(action, payload, who = principal) {
  const input = { ...payload, operationId: payload.operationId || crypto.randomUUID() };
  const ctx = context(action, input, who);
  const op = await prepareOperation(runtime.db, {
    schoolId: who.schoolId, actorId: who.actorId, operationId: input.operationId,
    action: `calendar.${action}`, intent: { action, payload: input }, now: ctx.now,
    validUntil: who.validUntil, authorization: who,
  });
  await syntheticAdmission(runtime.db, op, { decisionId: who.decisionId });
  return handle(ctx);
}
async function durableContent() {
  return Promise.all(["calendar_events", "calendar_years", "calendar_sync", "product_outbox", "product_audit"]
    .map(table => query(runtime.db, `SELECT * FROM ${table} ORDER BY rowid`)));
}
const event = {
  Year: 2026, StaffTitle: "Synthetic multi-room event", StartDate: "2026-11-20",
  EndDate: "2026-11-20", EventType: "ALL_DAY", Status: "HIDDEN", LaneID: "day",
};
try {
  await mutate("saveYear", { Year: 2026, Status: "ACTIVE", ReleasedToTeachers: "No", expectedMetadataRevision: "missing" });
  const single = await mutate("saveEvent", { event: { ...event, VenueID: "room-1", Location: "R1 Room One" } });
  assert.equal(single.event.VenueID, "room-1");
  const location = "R2 Music, Dance and Drama, Off-campus, meeting point, R1 Room One";
  const payload = { operationId: "multi-room-save", event: { ...event, VenueID: "room-2,room-1", Location: location } };
  const saved = await mutate("saveEvent", payload);
  assert.equal(saved.event.VenueID, "room-2,room-1", "selected order is preserved");
  assert.equal(saved.event.Location, location, "commas in directory labels and free text are not parsed as IDs");
  const beforeReplay = await durableContent();
  assert.deepEqual(await mutate("saveEvent", payload), saved);
  assert.deepEqual(await durableContent(), beforeReplay, "same operation has one durable effect");
  await assert.rejects(() => mutate("saveEvent", {
    ...payload, event: { ...payload.event, VenueID: "room-1,room-2" },
  }), error => error.code === "OPERATION_INTENT_CONFLICT");
  assert.deepEqual(await durableContent(), beforeReplay, "reusing an operation for a reordered selection cannot change its saved intent");
  const sixIds = rooms.slice(0, 6).map(r => r.id).join(",");
  const six = await mutate("saveEvent", { event: { ...event, VenueID: sixIds, Location: "Owner-supplied label spelling" } });
  assert.equal(six.event.VenueID, sixIds);
  assert.equal(six.event.Location, "Owner-supplied label spelling", "display spelling does not grant authority or block a valid selection");
  const spaced = await mutate("saveEvent", { event: { ...event, VenueID: " room-2 , room-1 ", Location: location } });
  assert.equal(spaced.event.VenueID, "room-2,room-1");

  for (const VenueID of ["room-1,room-1", "room-1,", ",room-1", "room-1,,room-2", " ", "room-1,unknown-room", "room-1,foreign-school-room", rooms.map(r => r.id).join(",")]) {
    const before = await durableContent();
    await assert.rejects(() => mutate("saveEvent", { event: { ...event, VenueID, Location: location } }), e => e.code === "INVALID_VENUE" && e.status === 409);
    assert.deepEqual(await durableContent(), before, `invalid selection ${VenueID} makes no event/year/sync/audit change`);
  }
  const partial = await mutate("saveEvent", { event: { EventID: saved.eventId, StaffTitle: "Synthetic edited title" }, expectedRevision: 1 });
  assert.equal(partial.event.VenueID, "room-2,room-1");
  assert.equal(partial.event.Location, location, "omitted location fields survive partial edit");
  const staleBefore = await durableContent();
  await assert.rejects(() => mutate("saveEvent", { event: { EventID: saved.eventId, VenueID: "room-3" }, expectedRevision: 1 }), e => e.code === "REVISION_CONFLICT");
  assert.deepEqual(await durableContent(), staleBefore);
  const copied = await mutate("relocateEvent", { eventId: saved.eventId, expectedRevision: 2, mode: "copy", anchorDate: "2026-11-20", targetDate: "2026-11-21" });
  assert.notEqual(copied.eventId, saved.eventId);
  assert.equal(copied.event.VenueID, "room-2,room-1");
  assert.equal(copied.event.Location, location);
  const moved = await mutate("relocateEvent", { eventId: copied.eventId, expectedRevision: 1, anchorDate: "2026-11-21", targetDate: "2026-11-22" });
  assert.equal(moved.event.StartDate, "2026-11-22");
  assert.equal(moved.event.VenueID, "room-2,room-1");
  assert.equal(moved.event.Location, location);
  for (const who of [{ ...principal, capabilities: ["calendar.read"] }, { ...principal, impersonating: true }]) {
    const before = await durableContent();
    await assert.rejects(() => handle(context("saveEvent", payload, who)), e => ["CAPABILITY_DENIED", "IMPERSONATION_DENIED"].includes(e.code));
    assert.deepEqual(await durableContent(), before);
  }
  unavailable = true;
  const unavailableBefore = await durableContent();
  await assert.rejects(() => mutate("saveEvent", { event: { ...event, VenueID: "room-1,room-2" } }), e => e.code === "DEPENDENCY_UNAVAILABLE" && e.status === 503 && e.retryable);
  assert.deepEqual(await durableContent(), unavailableBefore, "outage is not converted to an invalid-room denial or partial save");
  const readsBeforeCustom = catalogueReads;
  const custom = await mutate("saveEvent", { event: { ...event, VenueID: "", Location: "Unlisted place, owner supplied" } });
  assert.equal(custom.event.Location, "Unlisted place, owner supplied");
  assert.equal(catalogueReads, readsBeforeCustom, "custom-only text does not depend on a directory read");
  unavailable = false;
  const replayBeforeRestart = await durableContent();
  await runtime.restart();
  assert.deepEqual(await mutate("saveEvent", payload), saved, "restart returns original operation result, not a duplicate event");
  assert.deepEqual(await durableContent(), replayBeforeRestart);
  console.log("PASS Calendar multi-room selection: ordered 1/2/6 IDs, literal labels/custom text, malformed/foreign/missing IDs, atomic rejection, partial edit, copy/move, stale revision, replay/restart, authority and provider failure (actual D1; injected directory)");
} finally { await runtime.close(); }
