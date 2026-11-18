import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import {
  recordProviderReceipt,
  latestProviderReceipt,
  reconcileProviderReceipts,
} from "../v1/runtime/receipts.mjs";
import { claimJobs, finishJob } from "../v1/runtime/jobs.mjs";
import { one, query } from "../v1/runtime/store.mjs";

const h = await createDatabase("lord");
const schoolId = "receipt-school",
  now = Date.now();
const env = () => ({ DB: h.db, SCHOOL_ID: schoolId, SERVICE_NAME: "lord" });
let sequence = 0;
const event = (providerId, status, more = {}) => ({
  schoolId,
  provider: "whatsapp",
  providerId,
  status,
  occurredAt: now - 1000,
  eventId: "event-" + ++sequence,
  ...more,
});
async function job(id, providerId, state = "accepted", channel = "whatsapp") {
  await h.db
    .prepare(
      "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,provider_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      schoolId,
      id,
      "operation-" + id,
      "lord.booking-notification",
      JSON.stringify({ channel }),
      state,
      now,
      providerId,
      now,
    )
    .run();
}
const get = (id) =>
  one(h.db, "SELECT * FROM product_outbox WHERE school_id=? AND job_id=?", [
    schoolId,
    id,
  ]);
try {
  await job("one", "wamid.one");
  const delivered = event("wamid.one", "delivered");
  assert.equal(
    (await recordProviderReceipt(env(), delivered, now)).state,
    "recorded",
  );
  assert.equal((await get("one")).state, "delivered");
  assert.equal(
    (await recordProviderReceipt(env(), delivered, now)).duplicate,
    true,
  );
  assert.equal(
    (await query(h.db, "SELECT * FROM product_provider_events")).length,
    1,
  );
  await assert.rejects(
    recordProviderReceipt(env(), { ...delivered, status: "failed" }, now),
    (e) => e.code === "PROVIDER_EVENT_CONFLICT",
  );
  await recordProviderReceipt(
    env(),
    event("wamid.one", "read", { occurredAt: now - 2000 }),
    now,
  );
  await recordProviderReceipt(
    env(),
    event("wamid.one", "failed", { occurredAt: now }),
    now,
  );
  await recordProviderReceipt(
    env(),
    event("wamid.one", "sent", { occurredAt: now }),
    now,
  );
  assert.equal((await get("one")).last_code, "PROVIDER_READ");
  assert.equal(
    (await latestProviderReceipt(h.db, schoolId, "whatsapp", "wamid.one"))
      .status,
    "read",
  );
  console.log(
    "PASS provider receipts: durable deduplication, changed-event conflict and reordered read/delivery/failure.",
  );

  await job("failed", "wamid.failed");
  await recordProviderReceipt(env(), event("wamid.failed", "failed"), now);
  assert.equal((await get("failed")).state, "failed");
  assert.equal(
    (await claimJobs(h.db, { schoolId, now })).length,
    0,
    "A provider failure callback never queues a send.",
  );
  await recordProviderReceipt(
    env(),
    event("wamid.failed", "delivered", { occurredAt: now - 3000 }),
    now,
  );
  assert.equal(
    (await get("failed")).state,
    "delivered",
    "Authoritative delivery resolves a contradictory failed receipt.",
  );
  await job("parallel", "wamid.parallel");
  await Promise.all(
    ["sent", "read", "failed", "delivered"].map((status) =>
      recordProviderReceipt(env(), event("wamid.parallel", status), now),
    ),
  );
  assert.equal((await get("parallel")).last_code, "PROVIDER_READ");
  const conflict = await Promise.allSettled(
    ["sent", "failed"].map((status) =>
      recordProviderReceipt(
        env(),
        event("wamid.conflict", status, { eventId: "racing-event" }),
        now,
      ),
    ),
  );
  assert.equal(
    conflict.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    conflict.filter(
      (result) =>
        result.status === "rejected" &&
        result.reason.code === "PROVIDER_EVENT_CONFLICT",
    ).length,
    1,
    "Changed concurrent event reuse cannot replace immutable callback evidence.",
  );
  console.log(
    "PASS provider receipts: concurrent status delivery is monotonic and cannot resend a failed message.",
  );

  const early = event("wamid.early", "delivered");
  await recordProviderReceipt(env(), early, now);
  assert.equal(
    (
      await one(
        h.db,
        "SELECT matched_at FROM product_provider_events WHERE event_id=?",
        [early.eventId],
      )
    ).matched_at,
    null,
  );
  await h.restart();
  await job("early", null, "queued");
  const [leased] = await claimJobs(h.db, { schoolId, now });
  assert.equal(
    await finishJob(
      h.db,
      leased,
      { state: "accepted", providerId: "wamid.early" },
      now + 1,
    ),
    true,
  );
  assert.equal(
    (await get("early")).state,
    "delivered",
    "Persisted early receipt applies when sender identity arrives after restart.",
  );
  const interrupted = event("wamid.interrupted", "read");
  await recordProviderReceipt(env(), interrupted, now);
  await job("interrupted", "wamid.interrupted");
  await h.restart();
  await reconcileProviderReceipts(env(), now + 2);
  assert.equal(
    (await get("interrupted")).last_code,
    "PROVIDER_READ",
    "Scheduled recovery closes sender-save/reconcile crash interval.",
  );
  console.log(
    "PASS provider receipts: callback-before-sender-ID and post-save crash recovery on actual persistent D1.",
  );

  await job("late", null, "queued");
  const [late] = await claimJobs(h.db, { schoolId, now });
  await recordProviderReceipt(env(), event("wamid.late", "delivered"), now);
  assert.equal(
    await finishJob(
      h.db,
      late,
      { state: "accepted", providerId: "wamid.late" },
      now + 40000,
    ),
    false,
    "An expired sender cannot record its original accepted result.",
  );
  assert.equal(
    (await get("late")).state,
    "delivered",
    "Only the verified matching callback confirms late dispatch.",
  );
  await job("late-unknown", null, "queued");
  const [unknown] = await claimJobs(h.db, { schoolId, now });
  await finishJob(
    h.db,
    unknown,
    { state: "accepted", providerId: "wamid.unknown" },
    now + 40000,
  );
  assert.equal((await get("late-unknown")).state, "uncertain");
  assert.equal((await get("late-unknown")).provider_id, "wamid.unknown");
  await job("new-fence", null, "queued");
  const [oldAttempt] = await claimJobs(h.db, { schoolId, now });
  await h.db
    .prepare(
      "UPDATE product_outbox SET fence=fence+1,state='uncertain' WHERE school_id=? AND job_id='new-fence'",
    )
    .bind(schoolId)
    .run();
  await finishJob(
    h.db,
    oldAttempt,
    { state: "accepted", providerId: "wamid.old" },
    now + 40000,
  );
  assert.equal(
    (await get("new-fence")).provider_id,
    null,
    "An older attempt cannot attach an identity to a new fence.",
  );
  await h.restart();
  assert.equal((await get("late-unknown")).state, "uncertain");
  console.log(
    "PASS provider receipts: late provider identity is fenced, remains uncertain without callback, and can reconcile without a resend.",
  );

  // These owner-defined types always dispatch through WhatsApp, including
  // persisted payloads created before channel metadata existed.
  for (const type of [
    "roster-notification",
    "roster-inbox-reply",
    "roster-email",
    "roster-provider-receipt",
    "roster-unknown",
  ]) {
    const id = "legacy-" + type;
    await job(id, "wamid." + id);
    await h.db
      .prepare(
        "UPDATE product_outbox SET type=?,payload_json='{}' WHERE school_id=? AND job_id=?",
      )
      .bind(type, schoolId, id)
      .run();
    await recordProviderReceipt(env(), event("wamid." + id, "read"), now);
    const whatsapp = ["roster-notification", "roster-inbox-reply"].includes(
      type,
    );
    assert.equal(
      (await get(id)).state,
      whatsapp ? "delivered" : "accepted",
      type + " must use its exact owner-defined channel",
    );
  }
  console.log(
    "PASS provider receipts: only the two WhatsApp Roster job types reconcile without channel metadata; email, fanout and unknown types stay untouched.",
  );

  await job("email", "wamid.email", "accepted", "email");
  await recordProviderReceipt(env(), event("wamid.email", "delivered"), now);
  assert.equal(
    (await get("email")).state,
    "accepted",
    "A matching string in another provider channel conveys no authority.",
  );
  await assert.rejects(
    recordProviderReceipt(
      env(),
      event("wamid.one", "delivered", { schoolId: "different-school" }),
      now,
    ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    recordProviderReceipt(
      env(),
      event("wamid.one", "delivered", { provider: "email" }),
      now,
    ),
    (e) => e.code === "PROVIDER_RECEIPT_INVALID",
  );
  await assert.rejects(
    recordProviderReceipt(
      env(),
      event("wamid.one", "delivered", { capabilities: ["admin"] }),
      now,
    ),
    (e) => e.code === "PROVIDER_RECEIPT_INVALID",
  );
  await assert.rejects(
    recordProviderReceipt(
      env(),
      event("wamid.one", "delivered", { occurredAt: now + 60001 }),
      now,
    ),
    (e) => e.code === "PROVIDER_RECEIPT_INVALID",
  );
  await assert.rejects(
    recordProviderReceipt(env(), event("wamid.one", "deleted"), now),
    (e) => e.code === "PROVIDER_RECEIPT_INVALID",
  );
  assert.equal((await query(h.db, "SELECT * FROM lord_bookings")).length, 0);
  assert.equal(
    (await query(h.db, "SELECT * FROM product_operations")).length,
    0,
    "Provider evidence grants no business-operation authority.",
  );
  console.log(
    "PASS provider receipts: strict school/provider/channel/status/time schema, no business mutations or authority inference.",
  );
} finally {
  await h.close();
}
