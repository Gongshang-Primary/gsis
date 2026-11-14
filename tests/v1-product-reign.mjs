import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { handle } from "../v1/services/lord/service.mjs";
import { query, one, digest } from "../v1/runtime/store.mjs";
import { wrappedReport } from "../v1/services/lord/reign.mjs";
const h = await createDatabase("lord"),
  school = "reign-school",
  now = Date.now() + 120000;
const files = new Map();
let fileSeq = 0,
  operationSeq = 0,
  uncertain = false,
  deleteFailed = false,
  dbCalls = 0;
const root = "synthetic-root",
  folder = "synthetic-lord-folder";
async function provider(url, init = {}) {
  const u = new URL(url),
    parts = u.pathname.split("/"),
    fileId = parts.at(-1);
  if (u.pathname.endsWith("/generateIds"))
    return Response.json({ ids: ["drive-" + ++fileSeq] });
  if (fileId === folder)
    return Response.json({
      id: folder,
      mimeType: "application/vnd.google-apps.folder",
      parents: [root],
    });
  if (u.pathname === "/upload/drive/v3/files") {
    const raw = Buffer.from(init.body),
      boundary = init.headers["content-type"].split("boundary=")[1],
      first = raw.indexOf("\r\n\r\n") + 4,
      next = raw.indexOf("\r\n--" + boundary, first),
      metadata = JSON.parse(raw.subarray(first, next).toString()),
      dataStart = raw.indexOf("\r\n\r\n", next + 4) + 4,
      end = raw.indexOf("\r\n--" + boundary + "--", dataStart),
      bytes = raw.subarray(dataStart, end);
    assert.ok(
      !files.has(metadata.id),
      "an existing immutable file must be reconciled, never blindly overwritten",
    );
    files.set(metadata.id, { ...metadata, bytes: Uint8Array.from(bytes) });
    if (uncertain) {
      uncertain = false;
      return new Response("uncertain", { status: 503 });
    }
    return Response.json({ id: metadata.id });
  }
  const file = files.get(fileId);
  if (!file) return new Response("", { status: 404 });
  if (u.searchParams.get("alt") === "media") return new Response(file.bytes);
  return Response.json(
    {
      id: fileId,
      size: file.bytes.length,
      parents: file.parents,
      trashed: false,
    },
    { headers: { etag: "test-etag" } },
  );
}
const p = {
  schoolId: school,
  actorId: "admin",
  staffId: "staff",
  sessionId: "session",
  decisionId: "decision",
  validUntil: now + 86400000,
  capabilities: ["lord.admin", "lord.read"],
  dependencies: [{ owner: "core", scope: "account:admin", revision: 1 }],
  action: "lord.admin",
  requestDigest: "synthetic",
};
function env() {
  return {
    DB: {
      prepare(sql) {
        dbCalls++;
        return h.db.prepare(sql);
      },
      batch: (s) => h.db.batch(s),
    },
    ARTIFACTS: {
      put: (...args) => h.bucket.put(...args),
      get: (...args) => h.bucket.get(...args),
      delete: async (...args) => {
        if (deleteFailed) {
          deleteFailed = false;
          await h.bucket.delete(...args);
          throw Error("synthetic uncertain delete");
        }
        return h.bucket.delete(...args);
      },
    },
    SCHOOL_ID: school,
    SERVICE_NAME: "lord",
    GSIS_SECRET: "synthetic",
    DRIVE_BACKUP_ENABLED: "true",
    DRIVE_BACKUP_ROOT_ID: root,
    DRIVE_BACKUP_FOLDERS_JSON: JSON.stringify({ lord: folder }),
    GOOGLE_ACCESS_TOKEN: "synthetic-only",
    PROVIDER_FETCH: provider,
    CORE: {
      fetch: async (r) => {
        const b = await r.json();
        return Response.json({
          ok: true,
          data: new URL(r.url).pathname.endsWith("/release")
            ? { state: "released" }
            : {
                pinId: b.pinId,
                owner: "core",
                scope: b.scope,
                revision: b.revision,
                validUntil: p.validUntil,
              },
        });
      },
    },
  };
}
function call(path, body = {}, method = "POST", principal = p, override = {}) {
  return handle({
    env: { ...env(), ...override },
    path,
    method,
    body:
      method === "POST"
        ? { operationId: "reign-" + ++operationSeq, ...body }
        : body,
    principal,
    now,
    request: new Request("https://synthetic.test" + path),
  });
}
async function addBooking(
  id,
  status = "RETURNED",
  period = "old",
  date = "2026-01-01",
) {
  await h.db
    .prepare("INSERT INTO lord_bookings VALUES(?,?,?,?,?,?,?,?,1,'{}',?,?,?)")
    .bind(school, id, "staff", "admin", date, 1, 2, status, now, now, period)
    .run();
  await h.db
    .prepare("INSERT INTO lord_booking_items VALUES(?,?,?,?,?,?,?)")
    .bind(
      school,
      id,
      "cart",
      1,
      status === "RETURNED" ? 1 : 0,
      status === "RETURNED" ? 1 : 0,
      0,
    )
    .run();
}
async function archive(period = "old") {
  const prepared = await call("/reign/archive/prepare", { periodId: period });
  await call("/reign/archive/export", { archiveId: prepared.archiveId });
  return prepared.archiveId;
}
try {
  await h.db
    .prepare("INSERT INTO lord_resources VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(school, "cart", "Cart", "tablet", 10, 1, 1, 0, 1, "{}")
    .run();
  await h.db
    .prepare("INSERT INTO lord_periods VALUES(?,?,'closed',1,0,?,'{}')")
    .bind(school, "old", now)
    .run();
  await h.db
    .prepare("INSERT INTO lord_periods VALUES(?,?,'active',1,?,NULL,NULL)")
    .bind(school, "active", now)
    .run();
  await addBooking("returned");
  await addBooking("cancelled", "CANCELLED");
  await addBooking("unresolved");
  await addBooking("physical", "CLOSED");
  await addBooking("future", "BOOKED", "active", "2099-01-01");
  await addBooking("accessory");
  await h.db
    .prepare("INSERT INTO lord_incidents VALUES(?,?,?,?,'open',1,'{}',NULL,?)")
    .bind(school, "incident", "unresolved", "staff", now)
    .run();
  await h.db
    .prepare("INSERT INTO lord_accessories VALUES(?,?,'styluses',1,0)")
    .bind(school, "accessory")
    .run();
  const bytes = new TextEncoder().encode("synthetic photograph"),
    sha = await digest("synthetic photograph"),
    key = school + "/lord/photos/returned/" + sha;
  await h.bucket.put(key, bytes);
  await h.db
    .prepare("INSERT INTO lord_photos VALUES(?,?,?,?,?,?,?,?,?,?,'return')")
    .bind(
      school,
      "photo",
      "returned",
      key,
      sha,
      "image/png",
      bytes.length,
      "admin",
      now,
      1,
    )
    .run();
  await assert.rejects(
    call("/reign/archive/prepare", { periodId: "old" }, "POST", p, {
      DRIVE_BACKUP_ENABLED: "false",
    }),
    (e) => e.code === "DRIVE_BACKUP_NOT_CONFIGURED",
  );
  await assert.rejects(
    call("/reign/archive/prepare", { periodId: "old" }, "POST", {
      ...p,
      impersonating: true,
    }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    call("/reign/archive/prepare", { periodId: "old" }, "POST", {
      ...p,
      schoolId: "other-school",
    }),
    (e) => e.code === "PERIOD_NOT_CLOSED",
  );
  const prepared = await call("/reign/archive/prepare", { periodId: "old" }),
    archiveId = prepared.archiveId;
  assert.equal(prepared.state, "prepared");
  assert.equal(files.size, 0, "file IDs persisted before provider upload");
  const staged = JSON.parse(
    (
      await one(
        h.db,
        "SELECT manifest_json FROM lord_reign_archives WHERE archive_id=?",
        [archiveId],
      )
    ).manifest_json,
  );
  assert.equal(staged.files.length, 3);
  assert.ok(staged.files.every((f) => f.fileId));
  uncertain = true;
  await assert.rejects(
    call("/reign/archive/export", { archiveId }),
    (e) => e.code === "DRIVE_BACKUP_WRITE_UNCERTAIN",
  );
  assert.equal(files.size, 1);
  await h.restart();
  const exported = await call("/reign/archive/export", { archiveId });
  assert.equal(exported.state, "verified");
  assert.equal(files.size, 3, "retry recovered same immutable file identity");
  const recoveryFile = staged.files.find((f) => f.kind === "Recovery"),
    payload = JSON.parse(
      new TextDecoder().decode(files.get(recoveryFile.fileId).bytes),
    );
  assert.equal(
    payload.photos[0].bytesBase64,
    Buffer.from(bytes).toString("base64"),
  );
  assert.equal(payload.resources[0].resource_id, "cart");
  assert.ok(files.get(staged.files.find((f) => f.kind === "Wrapped").fileId));
  let preview = await call(
    "/reign/cleanup/preview?archiveId=" + archiveId,
    {},
    "GET",
  );
  assert.deepEqual(preview.eligibleBookingIds, ["cancelled", "returned"]);
  assert.equal(preview.preservedBookings, 3);
  assert.equal(preview.photos.length, 1);
  await assert.rejects(
    call("/reign/cleanup", {
      archiveId,
      previewDigest: preview.previewDigest,
      confirmation: "wrong",
    }),
    (e) => e.code === "CONFIRMATION_REQUIRED",
  );
  const file = files.get(recoveryFile.fileId),
    saved = file.bytes;
  file.bytes = new TextEncoder().encode("corrupted");
  await assert.rejects(
    call("/reign/cleanup/preview?archiveId=" + archiveId, {}, "GET"),
    (e) => e.code === "DRIVE_BACKUP_INTEGRITY",
  );
  file.bytes = saved;
  await h.db
    .prepare(
      "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,updated_at) VALUES(?,?,?,'lord.notification','{}','uncertain',?,?)",
    )
    .bind(school, "pending-job", "old-op", now, now)
    .run();
  preview = await call(
    "/reign/cleanup/preview?archiveId=" + archiveId,
    {},
    "GET",
  );
  assert.equal(preview.blockers[0].code, "BACKGROUND_WORK_RETAINED");
  await assert.rejects(
    call("/reign/cleanup", {
      archiveId,
      previewDigest: preview.previewDigest,
      confirmation: preview.confirmationText,
    }),
    (e) => e.code === "CLEANUP_BLOCKED",
  );
  await h.db
    .prepare(
      "UPDATE product_outbox SET state='delivered' WHERE job_id='pending-job'",
    )
    .run();
  preview = await call(
    "/reign/cleanup/preview?archiveId=" + archiveId,
    {},
    "GET",
  );
  dbCalls = 0;
  const cleared = await call("/reign/cleanup", {
    archiveId,
    previewDigest: preview.previewDigest,
    confirmation: preview.confirmationText,
  });
  assert.equal(cleared.state, "cleanup-pending");
  assert.ok(
    dbCalls < 50,
    "cleanup obeys D1 free-plan statement budget: " + dbCalls,
  );
  assert.equal(
    (
      await query(
        h.db,
        "SELECT booking_id FROM lord_bookings ORDER BY booking_id",
      )
    ).length,
    4,
  );
  assert.equal((await query(h.db, "SELECT * FROM lord_resources")).length, 1);
  assert.ok(await h.bucket.get(key));
  deleteFailed = true;
  await assert.rejects(
    call("/reign/cleanup/finish", { archiveId }),
    /synthetic uncertain delete/,
  );
  await h.restart();
  assert.equal(
    (await call("/reign/cleanup/finish", { archiveId })).state,
    "complete",
  );
  assert.equal(await h.bucket.get(key), null);
  assert.equal((await query(h.db, "SELECT * FROM lord_photos")).length, 0);
  assert.equal((await query(h.db, "SELECT * FROM lord_incidents")).length, 1);
  assert.equal((await query(h.db, "SELECT * FROM lord_accessories")).length, 1);
  assert.equal(files.size, 3);
  // Scale guard: fixed SQL count regardless of number of eligible bookings.
  await h.db
    .prepare("INSERT INTO lord_periods VALUES(?,?,'closed',1,0,?,'{}')")
    .bind(school, "bulk", now)
    .run();
  const statements = [];
  for (let i = 0; i < 500; i++)
    statements.push(
      h.db
        .prepare(
          "INSERT INTO lord_bookings VALUES(?,?,?,'admin','2026-01-01',1,2,'CANCELLED',1,'{}',?,?,'bulk')",
        )
        .bind(school, "bulk-" + i, "staff", now, now),
    );
  await h.db.batch(statements);
  const bulk = await archive("bulk"),
    bp = await call("/reign/cleanup/preview?archiveId=" + bulk, {}, "GET");
  assert.equal(bp.eligibleBookingIds.length, 500);
  dbCalls = 0;
  await call("/reign/cleanup", {
    archiveId: bulk,
    previewDigest: bp.previewDigest,
    confirmation: bp.confirmationText,
  });
  assert.ok(
    dbCalls < 50,
    "500-booking cleanup uses fixed statements: " + dbCalls,
  );
  await h.db
    .prepare("INSERT INTO lord_periods VALUES(?,?,'closed',1,0,?,'{}')")
    .bind(school, "linked", now)
    .run();
  await addBooking("live-linked", "RETURNED", "linked");
  await addBooking("safe-linked", "RETURNED", "linked");
  await h.db
    .prepare(
      "INSERT INTO lord_links VALUES(?,?,?,NULL,'booking-response','staff',?,0,'{}')",
    )
    .bind(school, "hash-only", "live-linked", now + 86400000)
    .run();
  const linked = await archive("linked"),
    lp = await call("/reign/cleanup/preview?archiveId=" + linked, {}, "GET");
  assert.deepEqual(lp.eligibleBookingIds, ["safe-linked"]);
  await call("/reign/cleanup", {
    archiveId: linked,
    previewDigest: lp.previewDigest,
    confirmation: lp.confirmationText,
  });
  assert.ok(
    await one(h.db, "SELECT booking_id FROM lord_bookings WHERE booking_id=?", [
      "live-linked",
    ]),
  );
  await h.db
    .prepare("INSERT INTO lord_periods VALUES(?,?,'closed',1,0,?,'{}')")
    .bind(school, "race", now)
    .run();
  await addBooking("race-booking", "RETURNED", "race");
  const race = await archive("race");
  await h.db
    .prepare("UPDATE lord_bookings SET revision=revision+1 WHERE booking_id=?")
    .bind("race-booking")
    .run();
  await assert.rejects(
    call("/reign/cleanup/preview?archiveId=" + race, {}, "GET"),
    (e) => e.code === "ARCHIVE_STALE",
  );
  assert.ok(
    await one(h.db, "SELECT booking_id FROM lord_bookings WHERE booking_id=?", [
      "race-booking",
    ]),
  );
  assert.match(
    wrappedReport({
      periodId: "<script>",
      bookings: [],
      items: [],
      events: [],
      incidents: [],
    }),
    /&lt;script&gt;/,
  );
  assert.doesNotMatch(
    wrappedReport({
      periodId: "period",
      bookings: [],
      items: [],
      events: [],
      incidents: [],
    }),
    /<script|https:\/\//,
  );
  console.log(
    "REIGN: verified full recovery, unknown upload/restart, tamper denial, dependency preservation, explicit cleanup, R2 restart and 500-booking D1 budget passed",
  );
} finally {
  await h.close();
}
