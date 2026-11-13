import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { handle, notificationIntent } from "../v1/services/lord/service.mjs";
import { closeOverdueSessions } from "../v1/services/lord/jobs.mjs";
import { one, query } from "../v1/runtime/store.mjs";
const h = await createDatabase("lord"),
  now = Date.now(),
  school = "synthetic-school",
  validUntil = now + 3 * 86400000;
const core = {
  async fetch(req) {
    const input = await req.json();
    return Response.json({
      ok: true,
      data: new URL(req.url).pathname.endsWith("/release")
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
const p = {
  schoolId: school,
  actorId: "actor",
  staffId: "staff",
  sessionId: "session",
  decisionId: "decision",
  validUntil,
  impersonating: false,
  capabilities: ["lord.admin", "lord.borrow", "lord.read", "lord.signage"],
  dependencies: [{ owner: "core", scope: "account:actor", revision: 1 }],
  action: "lord.admin",
  requestDigest: "synthetic",
};
let seq = 0,
  clock = now;
const env = () => ({
  DB: h.db,
  ARTIFACTS: h.bucket,
  CORE: core,
  SERVICE_NAME: "lord",
  SCHOOL_ID: school,
  GSIS_SECRET: "synthetic-test-only",
});
function call(path, body = {}, method = "POST", headers = {}, principal = p) {
  body =
    method === "POST" ? { operationId: "recovery-" + ++seq, ...body } : body;
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
}
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
      now,
    )
    .run();
  await call("/resources", {
    resourceId: "tablets",
    name: "Tablets",
    type: "tablet",
    capacity: 10,
    revision: 0,
  });
  const date = new Date(now + 8 * 3600000).toISOString().slice(0, 10),
    b = await call("/bookings", {
      date,
      startPeriod: 2,
      endPeriod: 2,
      resourceId: "tablets",
      quantity: 10,
      classOrActivity: "Synthetic class",
      subject: "Science",
    });
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xUAAAAASUVORK5CYII=";
  const photo = await call("/photos", {
    bookingId: b.bookingId,
    mime: "image/png",
    base64: png,
  });
  assert.equal(photo.bytes, 68);
  assert.match(photo.sha256, /^[a-f0-9]{64}$/);
  const loaded = await call("/photos/" + photo.photoId, {}, "GET");
  assert.equal(loaded.headers.get("content-type"), "image/png");
  assert.equal((await loaded.arrayBuffer()).byteLength, 68);
  await assert.rejects(
    call(
      "/photos/" + photo.photoId,
      {},
      "GET",
      {},
      {
        ...p,
        staffId: "foreign-staff",
        capabilities: ["lord.read", "lord.borrow"],
      },
    ),
    (e) => e.status === 403,
  );
  await call("/collect", {
    bookingId: b.bookingId,
    revision: 1,
    items: [{ resourceId: "tablets", quantity: 8 }],
    photoIds: [photo.photoId],
  });

  const photosDevice = await call("/links", {
    purpose: "signage",
    deviceId: "photo-device",
    resourceIds: ["tablets"],
    photos: true,
    expiresAt: clock + 2 * 86400000,
  });
  const shown = await call(
    "/board?date=" + date,
    {},
    "GET",
    { "x-gsis-device-token": photosDevice.token },
    null,
  );
  assert.deepEqual(shown.bookings[0].photoIds, [photo.photoId]);
  const signedPhoto = await call(
    "/board?photoId=" + photo.photoId,
    {},
    "GET",
    { "x-gsis-device-token": photosDevice.token },
    null,
  );
  assert.equal((await signedPhoto.arrayBuffer()).byteLength, 68);
  const wrongScope = await call("/links", {
    purpose: "signage",
    deviceId: "other-device",
    resourceIds: ["other"],
    photos: true,
    expiresAt: clock + 2 * 86400000,
  });
  await assert.rejects(
    call(
      "/board?photoId=" + photo.photoId,
      {},
      "GET",
      { "x-gsis-device-token": wrongScope.token },
      null,
    ),
    (e) => e.status === 403,
  );
  const closeAt = Date.parse(date + "T18:01:00+08:00");
  clock = Date.parse(date + "T17:00:00+08:00");
  await assert.rejects(
    call("/reign/close", { periodId: "initial", revision: 0 }),
    (e) => e.code === "ARCHIVE_WINDOW",
  );
  clock = closeAt;
  await assert.rejects(
    call("/reign/close", { periodId: "initial", revision: 0 }),
    (e) => e.code === "OPEN_OBLIGATIONS",
  );
  const first = await closeOverdueSessions(env(), closeAt),
    second = await closeOverdueSessions(env(), closeAt);
  assert.equal(first.results.length, 1);
  assert.equal(second.results.length, 0);
  const closed = await one(
    h.db,
    "SELECT * FROM lord_bookings WHERE booking_id=?",
    [b.bookingId],
  );
  assert.equal(closed.status, "CLOSED");
  await assert.rejects(
    call(
      "/board?photoId=" + photo.photoId,
      {},
      "GET",
      { "x-gsis-device-token": photosDevice.token },
      null,
    ),
    (e) => e.status === 404,
  );
  const item = await one(
    h.db,
    "SELECT * FROM lord_booking_items WHERE booking_id=?",
    [b.bookingId],
  );
  assert.equal(item.collected_quantity, 8);
  assert.equal(item.returned_quantity, 0);
  const preview = await call("/reign/preview", {}, "GET");
  assert.equal(preview.blockers.length, 0);
  assert.ok(
    preview.warnings.some(
      (b) => b.status === "CLOSED" && b.physicalQuantityConfirmed === false,
    ),
  );
  const link = await call("/links", {
    purpose: "signage",
    deviceId: "display-one",
    resourceIds: ["tablets"],
    expiresAt: clock + 3600000,
  });
  await assert.rejects(
    call("/board?date=" + date, {}, "GET", {}, null),
    (e) => e.code === "DEVICE_SESSION_REQUIRED",
  );
  const board = await call(
    "/board?date=" + date,
    {},
    "GET",
    { "x-gsis-device-token": link.token },
    null,
  );
  assert.equal(board.bookings.length, 1);
  assert.equal(board.bookings[0].physicalReturnConfirmed, false);
  assert.ok(!JSON.stringify(board).includes("@example.test"));
  await call("/links/revoke", { tokenHash: link.tokenHash });
  await assert.rejects(
    call(
      "/board?date=" + date,
      {},
      "GET",
      { "x-gsis-device-token": link.token },
      null,
    ),
    (e) => e.code === "DEVICE_SESSION_INVALID",
  );
  const returnPhoto = await call("/photos", {
    bookingId: b.bookingId,
    mime: "image/png",
    base64: png,
  });
  const returned = await call("/return", {
    bookingId: b.bookingId,
    revision: 3,
    items: [
      { resourceId: "tablets", quantity: 8, photoIds: [returnPhoto.photoId] },
    ],
  });
  assert.equal(returned.status, "RETURNED");
  const tomorrow = new Date(Date.parse(date + "T00:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
  const future = await call("/bookings", {
    date: tomorrow,
    startPeriod: 2,
    endPeriod: 2,
    resourceId: "tablets",
    quantity: 1,
    classOrActivity: "Future class",
    subject: "Science",
  });
  const reviewed = await call("/reign/preview", {}, "GET");
  const archive = await call("/reign/close", {
    periodId: "initial",
    revision: 0,
    nextPeriodId: "next",
    sourceVersion: reviewed.sourceVersion,
    confirmation: reviewed.confirmationText,
  });
  assert.equal(archive.recordsRetained, true);
  assert.match(archive.manifest.sha256, /^[a-f0-9]{64}$/);
  assert.ok(await h.bucket.get(archive.manifest.objectKey));
  assert.equal(archive.files.length, 3);
  const exported = await call(
    "/reign/archive?periodId=initial&format=md",
    {},
    "GET",
  );
  assert.match(await exported.text(), /Future bookings preserved: 1/);
  assert.equal((await query(h.db, "SELECT * FROM lord_bookings")).length, 2);
  assert.equal(
    (
      await notificationIntent(env(), {
        schoolId: school,
        bookingId: b.bookingId,
        kind: "collection-reminder",
      })
    ).state,
    "suppressed",
  );
  assert.equal(
    (
      await one(
        h.db,
        "SELECT period_id FROM lord_bookings WHERE booking_id=?",
        [future.bookingId],
      )
    ).period_id,
    "next",
  );
  await assert.rejects(
    call("/photos", { bookingId: b.bookingId, mime: "image/png", base64: png }),
    (e) => e.code === "BOOKING_STATE",
  );
  await h.restart();
  const after = await one(
    h.db,
    "SELECT manifest_json FROM lord_periods WHERE period_id='initial'",
  );
  assert.equal(JSON.parse(after.manifest_json).sha256, archive.manifest.sha256);
  console.log(
    "PASS LORD recovery: verified private photo, narrow revocable signage token, idempotent administrative close never invents return, open custody gates REIGN, explicit closure warnings, future booking preservation and durable archive after restart.",
  );
} finally {
  await h.close();
}
