import assert from "node:assert/strict";
import { origin, productSuite } from "./v1-product/suite.mjs";

async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const suite = await productSuite();
try {
  const admin = await suite.seedAccount("dr-admin");
  const smc = await suite.seedAccount("dr-smc", {
    capabilities: ["roster.read", "roster.write", "roster.own"],
  });
  const teacher = await suite.seedAccount("dr-teacher", {
    capabilities: ["roster.own"],
  });
  const db = await suite.db("roster");
  const bucket = await suite.mf.getR2Bucket("ARTIFACTS", "gsis-roster");
  const now = Date.now();
  const reportDate = "2026-11-18";

  // Seed diverse notification outbox rows + 1 internal non-notification job that must be ignored.
  await db.batch([
    db
      .prepare(
        "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,attempts,fence,lease_until,provider_id,last_code,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        "synthetic-school",
        "job-queued-1",
        "op-q1",
        "roster-notification",
        JSON.stringify({
          date: reportDate,
          name: "Tan Mei Ling",
          kind: "relief_assignment",
          channel: "whatsapp",
        }),
        "queued",
        now,
        0,
        1,
        null,
        null,
        null,
        now - 4000,
      ),
    db
      .prepare(
        "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,attempts,fence,lease_until,provider_id,last_code,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        "synthetic-school",
        "job-leased-1",
        "op-l1",
        "roster-notification",
        JSON.stringify({
          date: reportDate,
          name: "Lim Wei Ming",
          kind: "relief_updated",
          channel: "whatsapp",
        }),
        "leased",
        now,
        1,
        2,
        now + 60000,
        null,
        null,
        now - 3000,
      ),
    db
      .prepare(
        "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,attempts,fence,lease_until,provider_id,last_code,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        "synthetic-school",
        "job-failed-1",
        "op-f1",
        "roster-notification",
        JSON.stringify({
          date: reportDate,
          name: "Priya Nair https://secret.example/token/abcdef1234567890abcdef1234567890",
          kind: "relief_urgent",
          channel: "whatsapp",
        }),
        "failed",
        now,
        2,
        1,
        null,
        "wamid.fail1",
        "META_132000",
        now - 2000,
      ),
    db
      .prepare(
        "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,attempts,fence,lease_until,provider_id,last_code,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        "synthetic-school",
        "job-uncertain-1",
        "op-u1",
        "roster-inbox-reply",
        JSON.stringify({
          date: reportDate,
          name: "Ahmad Razak",
          kind: "inbox_reply",
        }),
        "uncertain",
        now,
        1,
        1,
        null,
        null,
        "NETWORK_TIMEOUT",
        now - 1000,
      ),
    db
      .prepare(
        "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,attempts,fence,lease_until,provider_id,last_code,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        "synthetic-school",
        "job-delivered-1",
        "op-d1",
        "roster-notification",
        JSON.stringify({
          date: reportDate,
          name: "Delivered Teacher",
          kind: "relief_final",
        }),
        "delivered",
        now,
        1,
        1,
        null,
        "wamid.ok1",
        "PROVIDER_DELIVERED",
        now - 500,
      ),
    db
      .prepare(
        "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,attempts,fence,lease_until,provider_id,last_code,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        "synthetic-school",
        "job-internal-export",
        "op-exp",
        "roster-drive-export",
        JSON.stringify({ date: reportDate, name: "Internal Export" }),
        "failed",
        now,
        1,
        1,
        null,
        null,
        "EXPORT_FAIL",
        now - 100,
      ),
  ]);

  // 1. Unprivileged teacher denied deliveryReview.
  const deniedRead = await suite.request(teacher, "roster", "/operations", {
    method: "POST",
    body: { operation: "deliveryReview" },
  });
  assert.ok([403, 503].includes(deniedRead.status));

  // 2. Admin reads deliveryReview: sees failed + uncertain issues, queued pending, leased inFlight, excludes internal export.
  const adminView = await suite.call(admin, "roster", "/operations", {
    operation: "deliveryReview",
  });
  assert.equal(adminView.canCancel, true);
  assert.equal(adminView.inFlight, 1);
  assert.equal(adminView.uncertain, 1);
  assert.equal(adminView.unresolvedUncertain, 1);
  assert.equal(adminView.reviewedUncertain, 0);
  assert.equal(adminView.issues.length, 2);
  assert.equal(adminView.pending.length, 1);
  assert.equal(adminView.pending[0].id, "job-queued-1");
  const failedIssue = adminView.issues.find(
    (i) => i.id === "notification:job-failed-1",
  );
  const uncertainIssue = adminView.issues.find(
    (i) => i.id === "notification:job-uncertain-1",
  );
  assert.ok(failedIssue && uncertainIssue);
  assert.equal(failedIssue.code, 132000);
  assert.ok(
    !failedIssue.name.includes("https://secret.example"),
    "Diagnostic name must redact URLs",
  );
  assert.ok(
    adminView.reports.some(
      (r) =>
        r.date === reportDate &&
        r.url === `/api/whatsapp/reports/${reportDate}`,
    ),
  );

  // 3. SMC reads deliveryReview (with seeded Contacts authority) or verify capability split for cancelPendingNotifications.
  const smcCancelDenied = await suite.request(smc, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "cancelPendingNotifications",
      operationId: crypto.randomUUID(),
      items: [{ id: adminView.pending[0].id, token: adminView.pending[0].token }],
    },
  });
  assert.ok([403, 503].includes(smcCancelDenied.status));

  // 4. Stale token rejected with 409 on dismissDeliveryIssues.
  const staleDismiss = await suite.request(admin, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "dismissDeliveryIssues",
      operationId: crypto.randomUUID(),
      items: [{ id: uncertainIssue.id, token: "0".repeat(64) }],
    },
  });
  assert.equal(staleDismiss.status, 409);

  // 5. Dismiss uncertain issue: clears alert, increments reviewedUncertain, preserves product_outbox untouched, and supports idempotent retry.
  const dismissOpId = crypto.randomUUID();
  const dismissed = await suite.call(admin, "roster", "/operations", {
    operation: "dismissDeliveryIssues",
    operationId: dismissOpId,
    items: [{ id: uncertainIssue.id, token: uncertainIssue.token }],
  });
  assert.equal(dismissed.changed, 1);
  assert.equal(dismissed.messagesSent, 0);
  assert.equal(dismissed.unresolvedUncertain, 0);
  assert.equal(dismissed.reviewedUncertain, 1);
  assert.equal(dismissed.issues.length, 1);
  assert.equal(dismissed.issues[0].id, failedIssue.id);

  // Idempotent retry with same operationId returns receipt cleanly.
  const dismissedReplay = await suite.call(admin, "roster", "/operations", {
    operation: "dismissDeliveryIssues",
    operationId: dismissOpId,
    items: [{ id: uncertainIssue.id, token: uncertainIssue.token }],
  });
  assert.equal(dismissedReplay.changed, 1);
  assert.equal(dismissedReplay.receipt.operationId, dismissOpId);

  // Verify product_outbox history for job-uncertain-1 is completely preserved.
  const rawUncertain = await db
    .prepare("SELECT state, last_code, attempts FROM product_outbox WHERE school_id=? AND job_id=?")
    .bind("synthetic-school", "job-uncertain-1")
    .first();
  assert.equal(rawUncertain.state, "uncertain");
  assert.equal(rawUncertain.last_code, "NETWORK_TIMEOUT");

  // If the outbox row later changes (new attempt / timestamp), the alert automatically reopens!
  await db
    .prepare(
      "UPDATE product_outbox SET attempts=attempts+1, updated_at=updated_at+1000 WHERE school_id=? AND job_id=?",
    )
    .bind("synthetic-school", "job-uncertain-1")
    .run();
  const reopenedView = await suite.call(admin, "roster", "/operations", {
    operation: "deliveryReview",
  });
  assert.equal(reopenedView.unresolvedUncertain, 1);
  assert.equal(reopenedView.reviewedUncertain, 0);
  assert.equal(reopenedView.issues.length, 2);

  // 6. Cancel pending notification: only queued rows can be cancelled; leased/failed/uncertain rejected.
  const cancelLeased = await suite.request(admin, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "cancelPendingNotifications",
      operationId: crypto.randomUUID(),
      items: [{ id: "job-leased-1", token: "a".repeat(64) }],
    },
  });
  assert.equal(cancelLeased.status, 409);

  const cancelOpId = crypto.randomUUID();
  const cancelled = await suite.call(admin, "roster", "/operations", {
    operation: "cancelPendingNotifications",
    operationId: cancelOpId,
    items: [
      { id: reopenedView.pending[0].id, token: reopenedView.pending[0].token },
    ],
  });
  assert.equal(cancelled.changed, 1);
  assert.equal(cancelled.pending.length, 0);
  assert.equal(cancelled.messagesSent, 0);

  const cancelledRow = await db
    .prepare("SELECT state, last_code FROM product_outbox WHERE school_id=? AND job_id=?")
    .bind("synthetic-school", "job-queued-1")
    .first();
  assert.equal(cancelledRow.state, "cancelled");
  assert.equal(cancelledRow.last_code, "CANCELLED_BY_SMC");

  // Idempotent replay of cancelPendingNotifications succeeds.
  const cancelReplay = await suite.call(admin, "roster", "/operations", {
    operation: "cancelPendingNotifications",
    operationId: cancelOpId,
    items: [
      { id: reopenedView.pending[0].id, token: reopenedView.pending[0].token },
    ],
  });
  assert.equal(cancelReplay.changed, 1);
  assert.equal(cancelReplay.receipt.operationId, cancelOpId);

  // 7. /whatsapp/reports/<date> via BOTH /api/roster/whatsapp/reports/... AND gateway /api/whatsapp/reports/...
  const reportDirect = await suite.request(
    admin,
    "roster",
    `/whatsapp/reports/${reportDate}`,
    { method: "GET" },
  );
  assert.equal(reportDirect.status, 200);
  assert.match(reportDirect.headers.get("content-type"), /^text\/plain/i);
  assert.equal(reportDirect.headers.get("cache-control"), "private, no-store");
  assert.equal(reportDirect.headers.get("x-content-type-options"), "nosniff");
  assert.ok(String(reportDirect.body).includes(`WhatsApp delivery review — ${reportDate}`));
  assert.ok(String(reportDirect.body).includes("META_132000") || String(reportDirect.body).includes("Meta reported error 132000."));
  assert.ok(!String(reportDirect.body).includes("https://secret.example"));

  const reportGatewayRes = await suite.mf.dispatchFetch(
    `${origin}/api/whatsapp/reports/${reportDate}`,
    {
      method: "GET",
      headers: {
        cookie: `__Host-gsis_session=${admin.token}`,
        "x-csrf-token": admin.csrf,
      },
    },
  );
  assert.equal(reportGatewayRes.status, 200);
  const reportGatewayText = await reportGatewayRes.text();
  assert.ok(reportGatewayText.includes(`WhatsApp delivery review — ${reportDate}`));

  const reportHeadRes = await suite.mf.dispatchFetch(
    `${origin}/api/whatsapp/reports/${reportDate}`,
    {
      method: "HEAD",
      headers: { cookie: `__Host-gsis_session=${admin.token}` },
    },
  );
  assert.equal(reportHeadRes.status, 200);
  assert.equal(await reportHeadRes.text(), "");

  const badDate = await suite.request(
    admin,
    "roster",
    "/whatsapp/reports/synthetic-probe",
    { method: "GET" },
  );
  assert.equal(badDate.status, 400);

  const missingDate = await suite.request(
    admin,
    "roster",
    "/whatsapp/reports/2026-01-02",
    { method: "GET" },
  );
  assert.equal(missingDate.status, 404);

  const crossSiteReport = await suite.request(
    admin,
    "roster",
    `/whatsapp/reports/${reportDate}`,
    { method: "GET", headers: { "sec-fetch-site": "cross-site" } },
  );
  assert.equal(crossSiteReport.status, 403);

  // Archived R2 report integrity verification + tamper detection.
  const archiveDate = "2026-11-17";
  const archivedText = `WhatsApp delivery review — ${archiveDate}\nArchived text\n`;
  const archivedBytes = new TextEncoder().encode(archivedText);
  const archivedDigest = await sha256Hex(archivedBytes);
  const archiveKey = `schools/synthetic-school/delivery-reports/${archiveDate}/${archivedDigest}.txt`;
  await bucket.put(archiveKey, archivedBytes, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
  await db
    .prepare(
      "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,'deliveryReviewReports',?,?,NULL,'2026',1,?)",
    )
    .bind(
      "synthetic-school",
      archiveDate,
      archiveDate,
      JSON.stringify({
        status: "done",
        count: 1,
        objectKey: archiveKey,
        contentDigest: archivedDigest,
      }),
    )
    .run();

  const archivedOk = await suite.request(
    admin,
    "roster",
    `/whatsapp/reports/${archiveDate}`,
    { method: "GET" },
  );
  assert.equal(archivedOk.status, 200);
  assert.equal(archivedOk.body, archivedText);

  await bucket.put(archiveKey, new TextEncoder().encode("tampered content"));
  const archivedTampered = await suite.request(
    admin,
    "roster",
    `/whatsapp/reports/${archiveDate}`,
    { method: "GET" },
  );
  assert.equal(archivedTampered.status, 503);

  // 8. /whatsapp/media/<messageId> via BOTH /api/roster/whatsapp/media/... AND gateway /api/whatsapp/media/...
  const audioBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x11, 0x22, 0x33, 0x44]);
  const audioDigest = await sha256Hex(audioBytes);
  const audioKey = `schools/synthetic-school/inbox-media/${audioDigest}.ogg`;
  await bucket.put(audioKey, audioBytes, {
    httpMetadata: { contentType: "audio/ogg" },
  });
  await db.batch([
    db
      .prepare(
        "INSERT INTO roster_inbox(school_id,message_id,staff_id,received_at,state,assigned_to,revision,payload_json) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        "synthetic-school",
        "wamid.audio.1",
        "staff-1",
        now,
        "open",
        null,
        1,
        JSON.stringify({
          type: "audio",
          waId: "6591234567",
          audio: {
            mimeType: "audio/ogg; codecs=opus",
            objectKey: audioKey,
            sha256: audioDigest,
          },
        }),
      ),
    db
      .prepare(
        "INSERT INTO roster_inbox(school_id,message_id,staff_id,received_at,state,assigned_to,revision,payload_json) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        "synthetic-school",
        "wamid.escape.1",
        "staff-1",
        now,
        "open",
        null,
        1,
        JSON.stringify({
          type: "image",
          waId: "6591234567",
          image: {
            mimeType: "image/png",
            objectKey: "schools/other-school/inbox-media/stolen.png",
          },
        }),
      ),
    db
      .prepare(
        "INSERT INTO roster_inbox(school_id,message_id,staff_id,received_at,state,assigned_to,revision,payload_json) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        "synthetic-school",
        "wamid.html.1",
        "staff-1",
        now,
        "open",
        null,
        1,
        JSON.stringify({
          type: "image",
          waId: "6591234567",
          image: {
            mimeType: "text/html",
            objectKey: audioKey,
          },
        }),
      ),
  ]);

  // Full media fetch through gateway alias /api/whatsapp/media/<id>?waId=...
  const mediaRes = await suite.mf.dispatchFetch(
    `${origin}/api/whatsapp/media/${encodeURIComponent("wamid.audio.1")}?waId=6591234567`,
    {
      method: "GET",
      headers: { cookie: `__Host-gsis_session=${admin.token}` },
    },
  );
  assert.equal(mediaRes.status, 200);
  assert.equal(mediaRes.headers.get("content-type"), "audio/ogg");
  assert.equal(mediaRes.headers.get("content-security-policy"), "sandbox");
  assert.equal(mediaRes.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(mediaRes.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(new Uint8Array(await mediaRes.arrayBuffer()), audioBytes);

  // Partial HTTP Range request for audio seeking (206) and invalid range (416).
  const partialRes = await suite.mf.dispatchFetch(
    `${origin}/api/whatsapp/media/${encodeURIComponent("wamid.audio.1")}?waId=6591234567`,
    {
      method: "GET",
      headers: {
        cookie: `__Host-gsis_session=${admin.token}`,
        range: "bytes=0-3",
      },
    },
  );
  assert.equal(partialRes.status, 206);
  assert.equal(partialRes.headers.get("content-range"), "bytes 0-3/10");
  assert.deepEqual(
    new Uint8Array(await partialRes.arrayBuffer()),
    audioBytes.slice(0, 4),
  );

  const invalidRangeRes = await suite.mf.dispatchFetch(
    `${origin}/api/whatsapp/media/${encodeURIComponent("wamid.audio.1")}?waId=6591234567`,
    {
      method: "GET",
      headers: {
        cookie: `__Host-gsis_session=${admin.token}`,
        range: "bytes=99-120",
      },
    },
  );
  assert.equal(invalidRangeRes.status, 416);

  // Wrong waId, cross-school key, disallowed MIME, unauthenticated, and cross-site all rejected.
  const wrongWaId = await suite.request(
    admin,
    "roster",
    "/whatsapp/media/wamid.audio.1?waId=6599999999",
  );
  assert.equal(wrongWaId.status, 404);

  const crossSchool = await suite.request(
    admin,
    "roster",
    "/whatsapp/media/wamid.escape.1?waId=6591234567",
  );
  assert.equal(crossSchool.status, 404);

  const badMime = await suite.request(
    admin,
    "roster",
    "/whatsapp/media/wamid.html.1?waId=6591234567",
  );
  assert.equal(badMime.status, 415);

  const unauthMedia = await suite.mf.dispatchFetch(
    `${origin}/api/whatsapp/media/wamid.audio.1?waId=6591234567`,
  );
  assert.equal(unauthMedia.status, 401);

  const crossSiteMedia = await suite.request(
    admin,
    "roster",
    "/whatsapp/media/wamid.audio.1?waId=6591234567",
    { headers: { "sec-fetch-site": "cross-site" } },
  );
  assert.equal(crossSiteMedia.status, 403);

  console.log(
    "PASS v1 Roster deliveryReview, dismissDeliveryIssues, cancelPendingNotifications, /whatsapp/reports and /whatsapp/media",
  );
} finally {
  await suite.close();
}
