import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import { canonical, prepareOperation, one } from "../v1/runtime/store.mjs";
import { handle, internal } from "../v1/services/calendar/service.mjs";
const runtime = await createDatabase("calendar"),
  school = "school",
  now = Date.now(),
  principal = {
    schoolId: school,
    actorId: "admin",
    staffId: "person",
    capabilities: ["calendar.admin"],
    decisionId: "calendar-decision",
    validUntil: now + 600000,
  };
let destinationState = "prepared";
const env = () => ({
  DB: runtime.db,
  SCHOOL_ID: school,
  SERVICE_NAME: "calendar",
  GSIS_SECRET: "synthetic",
  CORE: {
    async fetch() {
      return Response.json({
        ok: true,
        data: {
          principal: { ...principal, decisionId: "roster-decision" },
          descriptor: {
            service: "roster",
            operationId: "roster-op",
            write: true,
            action: "roster.write",
            bodyDigest: "request-digest",
          },
        },
      });
    },
  },
  ROSTER: {
    async fetch() {
      return Response.json({
        ok: true,
        data: {
          state: destinationState,
          actorId: "admin",
          operationId: "roster-op",
          digest: "digest",
          requestDigest: "request-digest",
          authorityAction: "roster.write",
          fence: 1,
        },
      });
    },
  },
});
const pin = {
  schoolId: school,
  scope: "year:2026",
  pinId: "pin",
  destination: "roster",
  operationId: "roster-op",
  digest: "digest",
  fence: 1,
  revision: "1",
  validUntil: now + 600000,
  decisionId: "roster-decision",
};
const ictx = (path, body) => ({
  env: env(),
  path,
  body,
  now: Date.now(),
  internal: true,
  request: new Request("https://test/internal"),
});
const payload = {
  Year: 2026,
  Status: "ACTIVE",
  ReleasedToTeachers: "No",
  revision: 1,
  operationId: "change-year",
};
async function change() {
  const op = await prepareOperation(runtime.db, {
    schoolId: school,
    actorId: principal.actorId,
    operationId: payload.operationId,
    action: "calendar.saveYear",
    intent: { action: "saveYear", payload },
    now: Date.now(),
    validUntil: principal.validUntil,
    authorization: principal,
  });
  await syntheticAdmission(runtime.db, op, {
    decisionId: principal.decisionId,
  });
  return handle({
    env: env(),
    principal,
    now: Date.now(),
    request: new Request("https://test/api"),
    path: "/action",
    method: "POST",
    body: { action: "saveYear", payload },
  });
}
try {
  await runtime.db
    .prepare("INSERT INTO calendar_years VALUES(?,?,?,?,?,?)")
    .bind(
      school,
      2026,
      1,
      1,
      "ACTIVE",
      canonical({ Year: 2026, Status: "ACTIVE", ReleasedToTeachers: "Yes" }),
    )
    .run();
  const held = await internal(ictx("/internal/pins/acquire", pin));
  assert.equal(held.scope, "year:2026");
  await assert.rejects(change(), (e) => e.code === "SOURCE_CHANGE_PENDING");
  assert.equal(
    (await one(runtime.db, "SELECT revision FROM calendar_years")).revision,
    1,
  );
  await runtime.restart();
  await runtime.db
    .prepare("UPDATE source_pins SET valid_until=?")
    .bind(Date.now() - 1)
    .run();
  assert.equal(
    (
      await internal(
        ictx("/internal/pins/release", { schoolId: school, pinId: "pin" }),
      )
    ).state,
    "held",
    "elapsed time does not prove destination outcome",
  );
  destinationState = "committed";
  assert.equal(
    (
      await internal(
        ictx("/internal/pins/release", { schoolId: school, pinId: "pin" }),
      )
    ).state,
    "released",
  );
  await change();
  assert.equal(
    (await one(runtime.db, "SELECT revision FROM calendar_years")).revision,
    2,
  );
  destinationState = "prepared";
  await assert.rejects(
    internal(ictx("/internal/pins/acquire", { ...pin, pinId: "late" })),
    (e) => e.code === "AUTHORITY_CHANGED",
  );
  const dates = await internal(
    ictx("/internal/dates", {
      schoolId: school,
      decisionId: "roster-decision",
      from: "2026-01-01",
      to: "2026-01-01",
    }),
  );
  assert.deepEqual(dates.dependencies, [
    { owner: "calendar", scope: "year:2026", revision: "2" },
  ]);
  console.log(
    "PASS Calendar source pins: owner update blocked, cancellation unresolved stays held after restart/expiry, durable destination completion releases, stale revision denied, scoped date dependency",
  );
} finally {
  await runtime.close();
}
