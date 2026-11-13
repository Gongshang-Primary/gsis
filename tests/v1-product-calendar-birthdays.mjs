import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { canonical, one, query } from "../v1/runtime/store.mjs";
import { reconcileContactsBirthdays } from "../v1/services/calendar/service.mjs";
const runtime = await createDatabase("calendar"),
  school = "school";
let signal = {
    schoolId: school,
    sourceOperationId: "contacts-op",
    eventId: "contacts-op.birthdays.0",
  },
  complete = true,
  revision = "contacts-1",
  staff = [
    { staffId: "person", name: "New name", active: true, birthday: "02-20" },
  ];
const env = () => ({
  DB: runtime.db,
  SCHOOL_ID: school,
  GSIS_SECRET: "synthetic",
  CONTACTS: {
    async fetch(r) {
      const x = await r.json();
      return Response.json({
        ok: true,
        data:
          x.eventId === signal.eventId
            ? { verified: true, state: "committed", ...signal }
            : { verified: false },
      });
    },
  },
  CONTACTS_CALENDAR: {
    async readBirthdays() {
      return {
        schemaVersion: 1,
        schoolId: school,
        source: "contacts",
        revision,
        complete,
        staff,
      };
    },
  },
});
try {
  await runtime.db.batch([
    runtime.db
      .prepare("INSERT INTO calendar_years VALUES(?,?,?,?,?,?)")
      .bind(
        school,
        2026,
        1,
        1,
        "ACTIVE",
        canonical({ Year: 2026, ReleasedToTeachers: "Yes" }),
      ),
    runtime.db
      .prepare("INSERT INTO calendar_years VALUES(?,?,?,?,?,?)")
      .bind(
        school,
        2027,
        1,
        0,
        "ACTIVE",
        canonical({ Year: 2027, ReleasedToTeachers: "No" }),
      ),
    runtime.db
      .prepare("INSERT INTO calendar_events VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(
        school,
        "birthday-2026-person",
        2026,
        1,
        "PUBLISHED",
        "2026-01-10",
        "2026-01-10",
        null,
        canonical({
          EventID: "birthday-2026-person",
          Year: 2026,
          StaffTitle: "Old name birthday",
          StartDate: "2026-01-10",
          EndDate: "2026-01-10",
          OwnerTag: "birthday",
          Status: "PUBLISHED",
        }),
      ),
  ]);
  const result = await reconcileContactsBirthdays(env(), signal);
  assert.equal(result.state, "committed");
  assert.equal(result.result.staged, 1);
  assert.equal(result.result.updated, 1);
  assert.equal(
    JSON.parse(
      (
        await one(
          runtime.db,
          "SELECT data_json FROM calendar_events WHERE year=2026",
        )
      ).data_json,
    ).StartDate,
    "2026-01-10",
    "released snapshot preserved",
  );
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT status FROM calendar_events WHERE year=2027",
      )
    ).status,
    "HIDDEN",
  );
  assert.equal(
    (await one(runtime.db, "SELECT COUNT(*) AS n FROM product_outbox")).n,
    0,
    "no provider jobs",
  );
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT released FROM calendar_years WHERE year=2027",
      )
    ).released,
    0,
    "no release",
  );
  await runtime.restart();
  assert.deepEqual(await reconcileContactsBirthdays(env(), signal), result);
  await assert.rejects(
    reconcileContactsBirthdays(env(), { ...signal, eventId: "forged" }),
    (e) => e.code === "SOURCE_UNCONFIRMED",
  );
  signal = {
    schoolId: school,
    sourceOperationId: "contacts-op2",
    eventId: "contacts-op2.birthdays.0",
  };
  complete = false;
  staff = [];
  await assert.rejects(
    reconcileContactsBirthdays(env(), signal),
    (e) => e.code === "SOURCE_INCOMPLETE",
  );
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT deleted_at FROM calendar_events WHERE year=2027",
      )
    ).deleted_at,
    null,
  );
  complete = true;
  revision = "contacts-2";
  await reconcileContactsBirthdays(env(), signal);
  assert.ok(
    (
      await one(
        runtime.db,
        "SELECT deleted_at FROM calendar_events WHERE year=2027",
      )
    ).deleted_at,
  );
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT deleted FROM calendar_birthday_pending WHERE year=2026",
      )
    ).deleted,
    1,
  );
  signal = {
    schoolId: school,
    sourceOperationId: "late",
    eventId: "late.birthdays.0",
  };
  revision = "contacts-1";
  staff = [{ staffId: "person", name: "Old", active: true, birthday: "01-01" }];
  await reconcileContactsBirthdays(env(), signal);
  assert.ok(
    (
      await one(
        runtime.db,
        "SELECT deleted_at FROM calendar_events WHERE year=2027",
      )
    ).deleted_at,
    "older observation cannot revive removed person",
  );
  assert.equal(
    (
      await query(
        runtime.db,
        "SELECT * FROM calendar_birthday_heads WHERE source_sequence=2",
      )
    ).length,
    2,
  );
  console.log(
    "PASS Calendar birthdays: narrow durable source proof, hidden working updates, released snapshot preserved, no external/release jobs, restart idempotency, incomplete/forged/older evidence denied",
  );
} finally {
  await runtime.close();
}
