import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { handle } from "../v1/services/lord/service.mjs";
import { query, one } from "../v1/runtime/store.mjs";
const h = await createDatabase("lord"),
  school = "synthetic-school",
  today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
  baseTime = Date.parse(today + "T07:00:00+08:00"),
  validUntil = Date.now() + 3 * 86400000;
let clock = baseTime,
  seq = 0;
const core = {
  async fetch(req) {
    const b = await req.json();
    return Response.json({
      ok: true,
      data: new URL(req.url).pathname.endsWith("/release")
        ? { state: "released" }
        : {
            pinId: b.pinId,
            owner: "core",
            scope: b.scope,
            revision: b.revision,
            validUntil,
          },
    });
  },
};
const p = {
  schoolId: school,
  actorId: "actor",
  staffId: "staff",
  sessionId: "session",
  decisionId: "decision",
  validUntil,
  capabilities: ["admin"],
  dependencies: [{ owner: "core", scope: "account:actor", revision: 1 }],
  action: "lord.admin",
  requestDigest: "synthetic",
};
const env = () => ({
  DB: h.db,
  ARTIFACTS: h.bucket,
  CORE: core,
  SERVICE_NAME: "lord",
  SCHOOL_ID: school,
  GSIS_SECRET: "synthetic-test-only",
});
const call = (
  path,
  data = {},
  method = "POST",
  principal = p,
  headers = {},
) => {
  const body =
    method === "POST" ? { operationId: "declaration-" + ++seq, ...data } : data;
  return handle({
    env: env(),
    path,
    body,
    method,
    principal,
    now: clock,
    request: new Request("https://example.test" + path, {
      method,
      headers,
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }),
  });
};
try {
  await h.db
    .prepare("INSERT INTO lord_references VALUES(?,?,?,?,?,?,?)")
    .bind(
      school,
      "staff",
      "Synthetic Teacher",
      "teacher@example.test",
      null,
      "r1",
      baseTime,
    )
    .run();
  await call("/resources", {
    resourceId: "cart",
    name: "Cart",
    type: "tablet",
    capacity: 10,
    revision: 0,
  });
  await call("/settings", {
    key: "periodTimings",
    revision: 0,
    value: { periods: [{ code: "2", start: "08:00", end: "09:00" }] },
  });
  const b = await call("/bookings", {
    date: today,
    startPeriod: 2,
    endPeriod: 2,
    resourceId: "cart",
    quantity: 10,
    classOrActivity: "Synthetic class",
    subject: "Science",
  });
  const body = {
    bookingId: b.bookingId,
    revision: 1,
    confirmed: true,
    response: "collected",
    items: [{ resourceId: "cart", quantity: 8 }],
  };
  await assert.rejects(
    call("/bookings/respond", body),
    (e) => e.code === "DECLARATION_WINDOW",
  );
  clock = Date.parse(today + "T08:31:00+08:00");
  await assert.rejects(
    call("/bookings/respond", body, "POST", { ...p, staffId: "other-admin" }),
    (e) => e.status === 403,
    "Admin cannot declare on another teacher’s behalf",
  );
  await assert.rejects(
    call("/bookings/respond", { ...body, confirmed: false }),
    (e) => e.code === "CONFIRMATION_REQUIRED",
  );
  const collection = await call("/bookings/respond", body);
  assert.equal(collection.status, "COLLECTED");
  assert.equal(collection.photosMissing, true);
  assert.equal((await query(h.db, "SELECT * FROM lord_photos")).length, 0);
  assert.equal(
    (await one(h.db, "SELECT collected_quantity FROM lord_booking_items"))
      .collected_quantity,
    8,
  );

  const link = await call("/links", {
    purpose: "incident-response",
    incidentId: collection.incidentId,
    expiresAt: clock + 3600000,
  });
  const responsePath =
    "/incidents/respond-context?incidentId=" +
    encodeURIComponent(collection.incidentId);
  const responseHeaders = { "x-gsis-incident-token": link.token };
  const listed = await call("/incidents/list", {}, "GET");
  assert.equal(listed.incidents[0].incidentId, collection.incidentId);
  const viewed = await call(responsePath, {}, "GET", p, responseHeaders);
  assert.equal(viewed.revision, 1);
  assert.equal(viewed.staffId, "staff");
  await assert.rejects(
    call(
      responsePath,
      {},
      "GET",
      { ...p, staffId: "other-admin" },
      responseHeaders,
    ),
    (e) => e.status === 403,
    "Signed link never grants an Admin the recipient identity",
  );
  await assert.rejects(
    call(
      "/incidents/respond-context?incidentId=" +
        encodeURIComponent(collection.incidentId),
      {},
      "GET",
    ),
    (e) => e.code === "LINK_INVALID",
  );
  await assert.rejects(
    call(
      "/incidents/respond",
      {
        incidentId: collection.incidentId,
        revision: 1,
        response: "Synthetic account response",
        token: link.token,
      },
      "POST",
      { ...p, staffId: "other-admin" },
    ),
    (e) => e.status === 403,
  );
  const answered = await call("/incidents/respond", {
    incidentId: collection.incidentId,
    revision: 1,
    response: "Synthetic account response",
    token: link.token,
  });
  assert.equal(answered.status, "responded");
  await call("/links/revoke", { tokenHash: link.tokenHash });
  await assert.rejects(
    call("/incidents/respond", {
      incidentId: collection.incidentId,
      revision: 2,
      response: "Second response",
      token: link.token,
    }),
    (e) => e.code === "LINK_INVALID",
  );
  await assert.rejects(
    call(responsePath, {}, "GET", p, responseHeaders),
    (e) => e.code === "LINK_INVALID",
  );
  const response = {
    bookingId: b.bookingId,
    sessionId: b.bookingId,
    revision: 2,
    confirmed: true,
    response: "returned",
  };
  await assert.rejects(
    call("/bookings/respond", response),
    (e) => e.code === "DECLARATION_WINDOW",
  );
  clock = Date.parse(today + "T09:31:00+08:00");
  const returned = await call("/bookings/respond", response);
  assert.equal(returned.status, "DECLARED_RETURNED");
  assert.equal(
    (await one(h.db, "SELECT returned_quantity FROM lord_booking_items"))
      .returned_quantity,
    0,
    "Declaration never invents physical quantities",
  );
  assert.equal((await query(h.db, "SELECT * FROM lord_incidents")).length, 2);
  const compliance = await call("/incidents", {}, "GET");
  assert.equal(compliance.collection, 1);
  assert.equal(compliance.return, 1);
  assert.equal(compliance.total, 2);
  assert.equal(compliance.affectedBookings, 1);
  assert.equal(compliance.incidents[0].teacher, "Synthetic Teacher");
  const replay = await call("/bookings/respond", {
    ...response,
    operationId: returned.receipt.operationId,
  });
  assert.equal(replay.receipt.operationId, returned.receipt.operationId);
  clock = Date.parse(today + "T18:01:00+08:00");
  const reviewed = await call("/reign/preview", {}, "GET");
  const archive = await call("/reign/close", {
    periodId: "initial",
    revision: 0,
    nextPeriodId: "next",
    sourceVersion: reviewed.sourceVersion,
    confirmation: reviewed.confirmationText,
  });
  const snapshot = await (
    await h.bucket.get(archive.manifest.objectKey)
  ).text();
  const historical = await call("/bookings/respond", {
    bookingId: b.bookingId,
    revision: 3,
    confirmed: true,
    response: "historical_return",
  });
  assert.equal(historical.historical, true);
  assert.equal(
    await (await h.bucket.get(archive.manifest.objectKey)).text(),
    snapshot,
  );
  assert.equal(
    (await one(h.db, "SELECT returned_quantity FROM lord_booking_items"))
      .returned_quantity,
    0,
  );
  await h.restart();
  assert.equal(
    (await one(h.db, "SELECT status FROM lord_bookings")).status,
    "DECLARED_RETURNED",
  );
  console.log(
    "PASS LORD declarations: owner-only even for Admin, explicit confirmation and timing, actual collection with missing-photo incident, unverified return preserved, replay, historical incident without archive mutation, restart.",
  );
} finally {
  await h.close();
}
