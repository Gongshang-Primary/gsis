import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import {
  handle,
  notificationIntent,
  policy,
} from "../v1/services/lord/service.mjs";
import { query, one } from "../v1/runtime/store.mjs";
const h = await createDatabase("lord");
const now = Date.now(),
  school = "synthetic-school",
  validUntil = now + 3600000;
// Domain storage tests use synthetic authority. Core authorization is tested independently.
const core = {
  async fetch(request) {
    const input = await request.json();
    return Response.json({
      ok: true,
      data: new URL(request.url).pathname.endsWith("/release")
        ? { state: "released" }
        : {
            pinId: input.pinId,
            owner: "core",
            scope: input.scope,
            revision: input.revision,
            validUntil,
          },
    });
  },
};
let counter = 0;
function principal(admin = true) {
  return {
    schoolId: school,
    actorId: "actor-1",
    staffId: "staff-1",
    sessionId: "session-1",
    decisionId: "decision-1",
    validUntil,
    impersonating: false,
    capabilities: admin
      ? ["lord.admin", "lord.borrow", "lord.read", "lord.signage"]
      : ["lord.borrow", "lord.read"],
    dependencies: [{ owner: "core", scope: "account:actor-1", revision: 1 }],
    action: "lord.borrow",
    requestDigest: "synthetic",
  };
}
function ctx(path, body = {}, method = "POST", p = principal()) {
  return {
    env: {
      DB: h.db,
      ARTIFACTS: h.bucket,
      CORE: core,
      SERVICE_NAME: "lord",
      GSIS_SECRET: "synthetic-test-only",
      SCHOOL_ID: school,
    },
    path,
    method,
    body,
    principal: p,
    now: Date.now(),
    request: new Request("https://example.test" + path, {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }),
  };
}
async function call(path, body = {}, method = "POST", p = principal()) {
  const payload =
    method === "POST" ? { operationId: "op-" + ++counter, ...body } : body;
  return handle(ctx(path, payload, method, p));
}
try {
  await h.db
    .prepare(
      "INSERT INTO lord_references(school_id,staff_id,name,email,mobile,source_revision,observed_at) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(
      school,
      "staff-1",
      "Synthetic Teacher",
      "synthetic@example.test",
      null,
      "contacts-1",
      now,
    )
    .run();
  const resource = await call("/resources", {
    resourceId: "cart-a",
    name: "Cart A",
    type: "MacBook Air",
    capacity: 20,
    exclusive: true,
    bufferPeriods: 1,
    revision: 0,
  });
  assert.equal(resource.revision, 1);
  const base = {
    date: "2026-11-16",
    startPeriod: 2,
    endPeriod: 3,
    resourceId: "cart-a",
    quantity: 10,
    classOrActivity: "Synthetic 1A",
    subject: "English",
  };
  const races = await Promise.allSettled([
    call("/bookings", base),
    call("/bookings", base),
  ]);
  assert.equal(races.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(races.filter((x) => x.status === "rejected").length, 1);
  assert.equal((await query(h.db, "SELECT * FROM lord_bookings")).length, 1);
  const booked = races.find((x) => x.status === "fulfilled").value;
  assert.equal(
    (await query(h.db, "SELECT * FROM product_outbox")).length,
    2,
    "losing CAS creates no notification",
  );
  const adjacent = await call(
    "/bookings/availability?date=2026-11-16&startPeriod=4&endPeriod=4&resourceId=cart-a&quantity=1&classOrActivity=synthetic&subject=English",
    {},
    "GET",
  ).catch((e) => e);
  assert.equal(adjacent.available, false, "one free period required");
  const originalId = booked.receipt.operationId;
  const replay = await handle(
    ctx("/bookings", { operationId: originalId, ...base }),
  );
  assert.equal(replay.bookingId, booked.bookingId);
  await assert.rejects(
    handle(
      ctx("/bookings", {
        operationId: originalId,
        ...base,
        remarks: "changed",
      }),
    ),
    (e) => e.code === "OPERATION_INTENT_CONFLICT",
  );

  await call("/resources", {
    resourceId: "shared-tablets",
    name: "Shared tablets",
    type: "tablet",
    capacity: 10,
    exclusive: false,
    bufferPeriods: 0,
    revision: 0,
  });
  const shared = { ...base, resourceId: "shared-tablets", quantity: 6 };
  const quantities = await Promise.allSettled([
    call("/bookings", shared),
    call("/bookings", shared),
  ]);
  assert.equal(
    quantities.filter((x) => x.status === "fulfilled").length,
    1,
    "Concurrent aggregate quantity is bounded",
  );
  await call("/bookings", { ...shared, quantity: 4 });
  await assert.rejects(
    call("/bookings", { ...shared, quantity: 1 }),
    (e) => e.status === 409,
  );
  const beforeBatch = (await one(h.db, "SELECT COUNT(*) n FROM lord_bookings"))
    .n;
  await assert.rejects(
    call("/bookings/batch", {
      bookings: [
        { ...shared, startPeriod: 10, endPeriod: 10 },
        { ...shared, startPeriod: 10, endPeriod: 10 },
      ],
    }),
    (e) => e.status === 409,
  );
  assert.equal(
    (await one(h.db, "SELECT COUNT(*) n FROM lord_bookings")).n,
    beforeBatch,
    "An internally conflicting batch commits no partial bookings",
  );
  const boundary = await call("/bookings", {
    ...shared,
    quantity: 10,
    startPeriod: 4,
    endPeriod: 4,
  });
  assert.equal(
    boundary.status,
    "BOOKED",
    "Half-open ending boundary does not consume the following period when buffer is zero",
  );
  const denied = principal(false);
  denied.staffId = "different-staff";
  await assert.rejects(
    call(
      "/collect",
      { bookingId: booked.bookingId, revision: 1 },
      "POST",
      denied,
    ),
    (e) => e.status === 403,
  );
  const preview = { ...principal(), impersonating: true };
  await assert.rejects(
    call(
      "/collect",
      { bookingId: booked.bookingId, revision: 1 },
      "POST",
      preview,
    ),
    (e) => e.code === "IMPERSONATION_DENIED",
  );
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xUAAAAASUVORK5CYII=";
  const photo = await call("/photos", {
    bookingId: booked.bookingId,
    mime: "image/png",
    base64: png,
  });
  const collected = await call("/collect", {
    bookingId: booked.bookingId,
    revision: 1,
    items: [{ resourceId: "cart-a", quantity: 10 }],
    photoIds: [photo.photoId],
  });
  assert.equal(collected.status, "COLLECTED");
  const returnPhoto = await call("/photos", {
    bookingId: booked.bookingId,
    mime: "image/png",
    base64: png,
  });
  const partial = await call("/return", {
    bookingId: booked.bookingId,
    revision: 2,
    items: [
      {
        resourceId: "cart-a",
        quantity: 4,
        issueQuantity: 1,
        issueDescription: "Synthetic broken key",
        photoIds: [returnPhoto.photoId],
      },
    ],
  });
  assert.equal(partial.remainingQuantity, 6);
  assert.equal(partial.status, "COLLECTED");
  assert.equal((await query(h.db, "SELECT * FROM lord_incidents")).length, 1);
  await assert.rejects(
    call("/return", {
      bookingId: booked.bookingId,
      revision: 2,
      items: [{ resourceId: "cart-a", quantity: 4 }],
    }),
    (e) => e.code === "REVISION_CONFLICT",
  );
  const finalPhoto = await call("/photos", {
    bookingId: booked.bookingId,
    mime: "image/png",
    base64: png,
  });
  const finished = await call("/return", {
    bookingId: booked.bookingId,
    revision: 3,
    items: [
      { resourceId: "cart-a", quantity: 6, photoIds: [finalPhoto.photoId] },
    ],
  });
  assert.equal(finished.status, "RETURNED");
  const reminder = await notificationIntent(
    ctx("/").env,
    { schoolId: school, bookingId: booked.bookingId },
    Date.now(),
  );
  assert.equal(reminder.state, "suppressed");
  const invalidPhoto = await call("/photos", {
    bookingId: booked.bookingId,
    mime: "image/png",
    base64: btoa("<script>"),
  }).catch((e) => e);
  assert.equal(invalidPhoto.code, "BOOKING_STATE");
  await h.restart();
  const restored = await call(
    "/transaction?action=bookingget&bookingId=" + booked.bookingId,
    {},
    "GET",
  );
  assert.equal(restored.booking.status, "RETURNED");
  assert.equal(restored.booking.items[0].returnedQuantity, 10);
  const other = { ...principal(), schoolId: "other-school" };
  await assert.rejects(
    call(
      "/transaction?action=bookingget&bookingId=" + booked.bookingId,
      {},
      "GET",
      other,
    ),
    (e) => e.status === 404,
  );
  assert.throws(
    () => policy("POST", "/not-a-route", {}),
    (e) => e.status === 404,
  );
  assert.equal(
    (await one(h.db, "SELECT COUNT(*) AS n FROM lord_item_events")).n,
    3,
  );
  const longestResource = "r" + "x".repeat(127);
  await call("/resources", {
    resourceId: longestResource,
    name: "Maximum ID resource",
    type: "tablet",
    capacity: 1,
    revision: 0,
  });
  const longest = await call("/bookings", {
    ...base,
    operationId: "b" + "x".repeat(127),
    resourceId: longestResource,
    quantity: 1,
  });
  assert.ok(longest.bookingId.length <= 128);
  assert.equal(
    (await call("/bookings/get?bookingId=" + longest.bookingId, {}, "GET"))
      .booking.bookingId,
    longest.bookingId,
  );
  const longPhoto = await call("/photos", {
    operationId: "p" + "x".repeat(127),
    bookingId: longest.bookingId,
    mime: "image/png",
    base64: png,
  });
  assert.ok(longPhoto.photoId.length <= 128);
  await call("/collect", {
    bookingId: longest.bookingId,
    revision: 1,
    items: [{ resourceId: longestResource, quantity: 1 }],
    photoIds: [longPhoto.photoId],
  });
  const issuePhoto = await call("/photos", {
    bookingId: longest.bookingId,
    mime: "image/png",
    base64: png,
  });
  await call("/return", {
    operationId: "i" + "x".repeat(127),
    bookingId: longest.bookingId,
    revision: 2,
    items: [
      {
        resourceId: longestResource,
        quantity: 1,
        issueQuantity: 1,
        issueDescription: "Synthetic issue",
        photoIds: [issuePhoto.photoId],
      },
    ],
  });
  const longIncident = await one(
    h.db,
    "SELECT incident_id FROM lord_incidents WHERE booking_id=?",
    [longest.bookingId],
  );
  assert.ok(longIncident.incident_id.length <= 128);
  assert.equal(
    (
      await call(
        "/incidents/get?incidentId=" + longIncident.incident_id,
        {},
        "GET",
      )
    ).incidentId,
    longIncident.incident_id,
  );
  console.log(
    "PASS LORD actual D1: last-resource race, no orphan outbox, preparation gap, original receipt replay, changed-intent rejection, own scope/preview denial, partial returns/issues, obsolete reminders, restart and school isolation.",
  );
} finally {
  await h.close();
}
