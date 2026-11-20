// Real built Worker/D1 regression test for Calendar two-step bulk event import (T03).
import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";

const suite = await productSuite();
const school = "synthetic-school";
let serial = 0;
const op = (label) => `synthetic-cal-bulk-${label}-${++serial}`;

try {
  const admin = await suite.seedAccount("synthetic-cal-bulk-admin");
  const reader = await suite.seedAccount("synthetic-cal-bulk-reader", {
    capabilities: ["calendar.read"],
  });
  const calDb = await suite.db("calendar");
  const venuesDb = await suite.db("venues");

  // Seed active year 2026 + archived year 2025 + lane + two venues in Venues DB.
  await calDb.batch([
    calDb
      .prepare("INSERT INTO calendar_years VALUES(?,?,?,?,?,?)")
      .bind(school, 2026, 1, 1, "ACTIVE", "{}"),
    calDb
      .prepare("INSERT INTO calendar_years VALUES(?,?,?,?,?,?)")
      .bind(school, 2025, 1, 1, "ARCHIVED", "{}"),
    calDb
      .prepare("INSERT INTO calendar_metadata VALUES(?,'lanes','day',0,1,?)")
      .bind(
        school,
        JSON.stringify({
          LaneID: "day",
          Header: "Day",
          Active: "Yes",
          SyncToStaffCalendar: "No",
        }),
      ),
  ]);
  await venuesDb.batch([
    venuesDb
      .prepare(
        "INSERT INTO venues_records(school_id,kind,record_id,revision,service_date,venue_id,status,data_json) VALUES(?,'venues',?,1,NULL,?,'active',?)",
      )
      .bind(
        school,
        "v-hall",
        "v-hall",
        JSON.stringify({ id: "v-hall", name: "Synthetic Hall", active: true, bookable: true }),
      ),
    venuesDb
      .prepare(
        "INSERT INTO venues_records(school_id,kind,record_id,revision,service_date,venue_id,status,data_json) VALUES(?,'venues',?,1,NULL,?,'active',?)",
      )
      .bind(
        school,
        "v-lab",
        "v-lab",
        JSON.stringify({ id: "v-lab", name: "Synthetic Lab", active: true, bookable: true }),
      ),
  ]);

  const call = (user, action, payload, operationId) =>
    suite.request(user, "calendar", "/operations", {
      method: "POST",
      body: { action, payload, ...(operationId ? { operationId } : {}) },
    });

  const validEvents = [
    {
      StaffTitle: "Synthetic Assembly",
      LaneID: "day",
      EventType: "TIMED",
      Status: "PUBLISHED",
      StartDate: "2026-07-06",
      EndDate: "2026-07-06",
      StartTime: "07:30",
      EndTime: "08:30",
      VenueID: "v-hall,v-lab",
      ParentEnabled: "No",
    },
    {
      StaffTitle: "Synthetic Learning Journey",
      LaneID: "day",
      EventType: "ALL_DAY",
      Status: "HIDDEN",
      StartDate: "2026-07-10",
      EndDate: "2026-07-10",
      ParentEnabled: "No",
    },
  ];

  // 1. Authorization & bounds checks.
  assert.equal(
    (await call(null, "importEventsPreview", { year: 2026, events: validEvents })).status,
    401,
  );
  assert.equal(
    (await call(reader, "importEventsPreview", { year: 2026, events: validEvents })).status,
    403,
  );
  assert.equal(
    (
      await call(
        reader,
        "importEventsApply",
        { year: 2026, events: validEvents, previewDigest: "a".repeat(64) },
        op("deny-apply"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(admin, "importEventsPreview", {
        schoolId: "foreign-school",
        year: 2026,
        events: validEvents,
      })
    ).status,
    403,
  );
  assert.equal(
    (await call(admin, "importEventsPreview", { year: 2026, events: [] })).status,
    400,
  );
  const oversize = Array.from({ length: 501 }, (_, i) => ({
    ...validEvents[1],
    StaffTitle: `Row ${i}`,
  }));
  assert.equal(
    (await call(admin, "importEventsPreview", { year: 2026, events: oversize })).status,
    413,
  );
  assert.equal(
    (await call(admin, "importEventsPreview", { year: 2025, events: validEvents })).status,
    409,
    "archived year rejected",
  );

  // 2. Preview with invalid rows reports per-row errors and makes zero DB writes.
  const badPreview = await call(admin, "importEventsPreview", {
    year: 2026,
    events: [
      { ...validEvents[0], StaffTitle: "   " },
      { ...validEvents[1], StartDate: "2026-07-12", EndDate: "2026-07-10" },
      { ...validEvents[0], VenueID: "v-does-not-exist" },
      { ...validEvents[1], Year: 2027 },
    ],
  });
  assert.equal(badPreview.status, 200, JSON.stringify(badPreview.body));
  assert.equal(badPreview.body.data.valid, false);
  assert.equal(badPreview.body.data.previewDigest, null);
  assert.equal(badPreview.body.data.errorCount, 4);
  assert.equal(
    (await calDb.prepare("SELECT COUNT(*) AS n FROM calendar_events").first()).n,
    0,
  );

  // 3. Valid preview computes deterministic previewDigest and performs zero DB writes.
  const preview = await call(admin, "importEventsPreview", {
    year: 2026,
    events: validEvents,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.data.valid, true);
  assert.equal(preview.body.data.validCount, 2);
  assert.equal(preview.body.data.yearRevision, 1);
  assert(/^[a-f0-9]{64}$/.test(preview.body.data.previewDigest));
  assert.equal(
    (await calDb.prepare("SELECT COUNT(*) AS n FROM calendar_events").first()).n,
    0,
    "preview performs zero writes",
  );

  // 4. Apply without previewDigest rejected.
  assert.equal(
    (
      await call(
        admin,
        "importEventsApply",
        { year: 2026, events: validEvents },
        op("missing-digest"),
      )
    ).status,
    400,
  );

  // 5. Apply with valid previewDigest commits atomically and replays idempotently.
  const applyOpId = op("apply");
  const applyPayload = {
    year: 2026,
    events: validEvents,
    previewDigest: preview.body.data.previewDigest,
    expectedYearRevision: 1,
  };
  const applied = await call(admin, "importEventsApply", applyPayload, applyOpId);
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  assert.equal(applied.body.data.importedCount, 2);
  assert.equal(applied.body.data.yearRevision, 2);
  assert.equal(applied.body.data.eventIds.length, 2);
  assert.equal(
    (await calDb.prepare("SELECT COUNT(*) AS n FROM calendar_events").first()).n,
    2,
  );
  assert.equal(
    (
      await calDb
        .prepare("SELECT revision FROM calendar_years WHERE school_id=? AND year=2026")
        .bind(school)
        .first()
    ).revision,
    2,
  );

  // Idempotent replay with same operationId returns exact same eventIds and does not duplicate.
  const replayed = await call(admin, "importEventsApply", applyPayload, applyOpId);
  assert.equal(replayed.status, 200, JSON.stringify(replayed.body));
  assert.deepEqual(replayed.body.data.eventIds, applied.body.data.eventIds);
  assert.equal(
    (await calDb.prepare("SELECT COUNT(*) AS n FROM calendar_events").first()).n,
    2,
  );

  // 6. Stale previewDigest after year revision changed is rejected with 409 REVISION_CONFLICT.
  const stale = await call(
    admin,
    "importEventsApply",
    applyPayload,
    op("stale-apply"),
  );
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  assert.equal(stale.body?.error?.code, "REVISION_CONFLICT");
  assert.equal(
    (await calDb.prepare("SELECT COUNT(*) AS n FROM calendar_events").first()).n,
    2,
  );

  console.log(
    "PASS v1 Calendar bulk event import (T03): preview validation, multi-room venue verification, bounds/auth/archived-year denial, atomic commit, idempotent replay, and CAS revision conflict.",
  );
} finally {
  await suite.close();
}
