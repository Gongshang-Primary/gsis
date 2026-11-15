import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { executeSyncJob } from "../v1/services/calendar/service.mjs";
import { canonical, one } from "../v1/runtime/store.mjs";
const runtime = await createDatabase("calendar");
const s = "school",
  eventId = "event-1",
  remoteId = "g0123456789abcdef",
  now = Date.now();
const event = {
  LaneID: "day",
  EventID: eventId,
  Year: 2026,
  Status: "PUBLISHED",
  StaffTitle: "Current title",
  StaffDescription: "Description",
  Location: "Room A",
  EventType: "TIMED",
  StartDate: "2026-11-16",
  EndDate: "2026-11-16",
  StartTime: "09:00",
  EndTime: "10:00",
  ParentEnabled: "No",
};
let sends = 0,
  release,
  enteredResolve;
const entered = new Promise((r) => (enteredResolve = r));
const env = {
  DB: runtime.db,
  SCHOOL_ID: s,
  SEND_OWNER: "v1",
  GOOGLE_ACCESS_TOKEN: "synthetic-token-never-live",
  GOOGLE_STAFF_CALENDAR_ID: "synthetic-calendar",
  PROVIDER_FETCH: async (url, options) => {
    sends++;
    enteredResolve();
    await new Promise((r) => (release = r));
    return Response.json({ id: remoteId, etag: "synthetic-etag" });
  },
};
try {
  await runtime.db.batch([
    runtime.db
      .prepare("INSERT INTO calendar_years VALUES(?,?,?,?,?,?)")
      .bind(s, 2026, 1, 1, "ACTIVE", "{}"),
    runtime.db
      .prepare("INSERT INTO calendar_metadata VALUES(?,'lanes','day',0,1,?)")
      .bind(
        s,
        canonical({ LaneID: "day", Active: "Yes", SyncToStaffCalendar: "Yes" }),
      ),
  ]);

  await runtime.db
    .prepare("INSERT INTO calendar_events VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(
      s,
      eventId,
      2026,
      1,
      "PUBLISHED",
      event.StartDate,
      event.EndDate,
      null,
      canonical(event),
    )
    .run();
  await runtime.db
    .prepare(
      "INSERT INTO calendar_sync(school_id,target,event_id,desired_revision,state,remote_id,intent_id,tombstone,next_at,data_json) VALUES(?,?,?,1,'queued',?,'intent1',0,?,?)",
    )
    .bind(s, "staff", eventId, remoteId, now, "{}")
    .run();
  const first = executeSyncJob(
    env,
    { schoolId: s, payload: { target: "staff", eventId, revision: 1 } },
    now,
  );
  await entered;
  await runtime.db.batch([
    runtime.db
      .prepare(
        "UPDATE calendar_events SET revision=2,deleted_at=?,data_json=? WHERE event_id=?",
      )
      .bind(
        new Date(now).toISOString(),
        canonical({ ...event, DeletedAt: new Date(now).toISOString() }),
        eventId,
      ),
    runtime.db
      .prepare(
        "UPDATE calendar_sync SET desired_revision=2,intent_id='intent2',tombstone=1,state='queued' WHERE event_id=?",
      )
      .bind(eventId),
  ]);
  const concurrentDelete = await executeSyncJob(
    env,
    { schoolId: s, payload: { target: "staff", eventId, revision: 2 } },
    now,
  );
  assert.equal(concurrentDelete.code, "PRIOR_PROVIDER_OUTCOME_UNRESOLVED");
  assert.equal(sends, 1);
  release();
  assert.equal((await first).state, "delivered");
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT state FROM calendar_sync WHERE event_id=?",
        [eventId],
      )
    ).state,
    "queued",
  );
  let deleteMethod;
  env.PROVIDER_FETCH = async (url, options) => {
    sends++;
    deleteMethod = options.method;
    return new Response(null, { status: 204 });
  };
  assert.equal(
    (
      await executeSyncJob(
        env,
        { schoolId: s, payload: { target: "staff", eventId, revision: 2 } },
        now,
      )
    ).state,
    "delivered",
  );
  assert.equal(deleteMethod, "DELETE");
  assert.equal(sends, 2);
  assert.equal(
    (
      await executeSyncJob(
        env,
        { schoolId: s, payload: { target: "staff", eventId, revision: 1 } },
        now,
      )
    ).state,
    "cancelled",
  );
  assert.equal(sends, 2);
  await runtime.db
    .prepare(
      "UPDATE calendar_sync SET desired_revision=3,intent_id='intent3',state='queued' WHERE event_id=?",
    )
    .bind(eventId)
    .run();
  await runtime.db
    .prepare("UPDATE calendar_events SET revision=3 WHERE event_id=?")
    .bind(eventId)
    .run();
  env.PROVIDER_FETCH = async () => {
    sends++;
    throw new TypeError("connection lost");
  };
  assert.equal(
    (
      await executeSyncJob(
        env,
        { schoolId: s, payload: { target: "staff", eventId, revision: 3 } },
        now,
      )
    ).state,
    "uncertain",
  );
  assert.equal(
    (await one(runtime.db, "SELECT state FROM calendar_dispatch_locks")).state,
    "uncertain",
  );
  await runtime.restart();
  env.DB = runtime.db;
  assert.equal(
    (
      await executeSyncJob(
        env,
        { schoolId: s, payload: { target: "staff", eventId, revision: 3 } },
        now,
      )
    ).code,
    "PRIOR_PROVIDER_OUTCOME_UNRESOLVED",
  );
  assert.equal(sends, 3);
  console.log(
    "PASS Calendar provider adapter: per-event serialization, deletion waits for in-flight upsert, stale completions cannot overwrite new intent, stale job suppressed, ambiguous delivery survives restart without blind retry. Provider HTTP synthetic; no live provider call.",
  );
} finally {
  await runtime.close();
}
