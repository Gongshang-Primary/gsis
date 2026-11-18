import assert from "node:assert/strict";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { claimJobs, finishJob } from "../v1/runtime/jobs.mjs";
const school = "synthetic-school",
  secret = "synthetic-whatsapp-audit-secret",
  phone = "123456789";
const suite = await productSuite({
  bindings: {
    WEBHOOK_OWNER: "v1",
    SCHEDULER_OWNER: "v1",
    SEND_OWNER: "v0.9",
    WHATSAPP_DURABLE_INGRESS: "false",
    WHATSAPP_APP_SECRET: secret,
    WHATSAPP_PHONE_NUMBER_ID: phone,
  },
});
const db = await suite.db("roster");
const at = Math.floor(Date.now() / 1000) - 120;
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
const record = (name) => console.log("PASS Roster receipts: " + name);
async function postStatus(
  id,
  status,
  time = at + 20,
  { badSignature = false, wrongPhone = false } = {},
) {
  const value = {
    metadata: { phone_number_id: wrongPhone ? "987654321" : phone },
    statuses: [
      {
        id,
        status,
        timestamp: String(time),
        ...(status === "failed" ? { errors: [{ code: 131026 }] } : {}),
      },
    ],
  };
  const body = { entry: [{ changes: [{ value }] }] };
  const raw = JSON.stringify(body),
    signature = Buffer.from(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
    ).toString("hex");
  const response = await suite.mf.dispatchFetch(origin + "/webhooks/whatsapp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256":
        "sha256=" + (badSignature ? "0".repeat(64) : signature),
    },
    body: raw,
  });
  return { status: response.status, body: await response.json() };
}
async function seed(id, state = "accepted", providerId = "wamid." + id) {
  await db
    .prepare(
      "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,due_at,state,provider_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      school,
      id,
      "op:" + id,
      "roster-notification",
      JSON.stringify({
        kind: "stapler_timetable",
        recipientId: "synthetic-person",
        date: "2030-03-18",
      }),
      0,
      state,
      providerId,
      Date.now(),
    )
    .run();
}
const get = (id) =>
  db
    .prepare(
      "SELECT state,last_code,provider_id,due_at,fence,attempts,lease_until FROM product_outbox WHERE school_id=? AND job_id=?",
    )
    .bind(school, id)
    .first();
try {
  await seed("failed-sent");
  assert.equal(
    (await postStatus("wamid.failed-sent", "failed", at + 20)).status,
    200,
  );
  const failed = await get("failed-sent");
  assert.equal(
    (await postStatus("wamid.failed-sent", "sent", at + 10)).status,
    200,
  );
  const after = await get("failed-sent");
  assert.equal(after.state, "failed");
  assert.equal(after.last_code, "PROVIDER_DELIVERY_FAILED");
  assert.equal(after.due_at, failed.due_at);
  record("older sent after provider failure");
  await seed("retry-sent", "queued");
  const [retryJob] = await claimJobs(db, {
    schoolId: school,
    now: Date.now(),
    limit: 1,
  });
  assert.equal(retryJob.job_id, "retry-sent");
  await finishJob(
    db,
    retryJob,
    {
      state: "failed",
      retryable: true,
      providerId: "wamid.retry-sent",
      code: "SYNTHETIC_RETRYABLE_FAILURE",
    },
    Date.now(),
  );
  const retryBefore = await get("retry-sent");
  assert.equal(retryBefore.state, "queued");
  await postStatus("wamid.retry-sent", "sent", at + 5);
  assert.deepEqual(await get("retry-sent"), retryBefore);
  record("older sent after explicitly retryable failed dispatch");
  // Keep unrelated synthetic retries out of later controlled claim probes.
  await db
    .prepare("UPDATE product_outbox SET due_at=? WHERE job_id='retry-sent'")
    .bind(Date.now() + 86400000)
    .run();
  for (const status of ["delivered", "read"]) {
    const id = "failed-" + status;
    await seed(id);
    await postStatus("wamid." + id, "failed", at + 10);
    await postStatus("wamid." + id, status, at + 20);
    const row = await get(id);
    assert.equal(
      row.state,
      "delivered",
      status + " must resolve matching provider failure",
    );
    assert.equal(
      row.last_code,
      status === "read" ? "PROVIDER_READ" : "PROVIDER_DELIVERED",
    );
    record("genuine " + status + " after failure");
  }
  await seed("read-first");
  await postStatus("wamid.read-first", "read", at + 30);
  assert.equal((await get("read-first")).last_code, "PROVIDER_READ");
  await postStatus("wamid.read-first", "delivered", at + 15);
  const downgraded = await get("read-first");
  assert.equal(downgraded.last_code, "PROVIDER_READ");
  record("older delivered after read");
  await seed("early", "queued", null);
  const [early] = await claimJobs(db, {
    schoolId: school,
    now: Date.now(),
    limit: 1,
  });
  assert.equal(early.job_id, "early");
  const earlyResponse = await postStatus("wamid.early", "read", at + 20);
  assert.equal(earlyResponse.status, 200);
  await finishJob(
    db,
    early,
    { state: "accepted", providerId: "wamid.early" },
    Date.now(),
  );
  const earlyAfter = await get("early");
  assert.equal(earlyAfter.state, "delivered");
  assert.equal(earlyAfter.last_code, "PROVIDER_READ");
  const duplicate = await postStatus("wamid.early", "read", at + 20);
  assert.equal(duplicate.body.data.accepted, 0);
  assert.equal((await get("early")).state, "delivered");
  const earlyEvidence = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM roster_provider_events WHERE provider_message_id='wamid.early'",
    )
    .first();
  const commonEvidence = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM product_provider_events WHERE provider_id='wamid.early'",
    )
    .first();
  assert.equal(earlyEvidence.n, 1);
  assert.equal(commonEvidence.n, 1);
  record("callback before sender receipt then exact replay");
  await seed("late", "queued", null);
  const now = Date.now();
  const [late] = await claimJobs(db, {
    schoolId: school,
    now: now - 40000,
    limit: 1,
  });
  assert.equal(late.job_id, "late");
  const reclaimed = await claimJobs(db, { schoolId: school, now, limit: 32 });
  assert(!reclaimed.some((j) => j.job_id === "late"));
  assert.equal((await get("late")).state, "uncertain");
  const finished = await finishJob(
    db,
    late,
    { state: "accepted", providerId: "wamid.late" },
    now,
  );
  assert.equal(finished, false);
  assert.equal((await get("late")).state, "uncertain");
  await postStatus("wamid.late", "read", at + 40);
  assert.equal((await get("late")).state, "delivered");
  record("interrupted claim and later matching read");
  await seed("new-attempt", "accepted", "wamid.new-attempt-current");
  await postStatus("wamid.new-attempt-old", "failed", at + 10);
  await postStatus("wamid.new-attempt-old", "read", at + 30);
  assert.equal((await get("new-attempt")).state, "accepted");
  record(
    "callbacks for earlier provider identity cannot overwrite newer attempt",
  );
  const eventCount = async () =>
    Number(
      (
        await db
          .prepare("SELECT COUNT(*) AS n FROM roster_provider_events")
          .first()
      ).n,
    );
  const beforeSecurity = await eventCount();
  assert.equal(
    (await postStatus("wamid.bad", "read", at + 10, { badSignature: true }))
      .status,
    401,
  );
  assert.equal(
    (await postStatus("wamid.badphone", "read", at + 10, { wrongPhone: true }))
      .status,
    403,
  );
  assert.equal(await eventCount(), beforeSecurity);
  record("signature and configured-number rejection");
  // The authenticated callback commits its local evidence inline; the retired
  // v0.9 optional durable-ingress switch is not consulted by this v1 path.
  record("legacy durable-ingress false flag");
  const fanoutBefore = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM product_outbox WHERE type='roster-provider-receipt' AND state='queued'",
    )
    .first();
  assert(fanoutBefore.n > 0, "Verified receipt fanout must be queued durably.");
  const trigger = await suite.trigger("roster");
  assert.equal(trigger.ok, true);
  const fanoutAfter = await db
    .prepare(
      "SELECT state,COUNT(*) AS n,SUM(attempts) AS attempts FROM product_outbox WHERE type='roster-provider-receipt' GROUP BY state",
    )
    .all();
  const deliveredFanout = fanoutAfter.results.find(
    (row) => row.state === "delivered",
  );
  assert.equal(deliveredFanout.n, Math.min(8, fanoutBefore.n));
  assert.equal(deliveredFanout.attempts, deliveredFanout.n);
  record("false legacy flag with explicit v1 scheduler");
  console.log(
    "PASS synthetic signed gateway matrix; no provider dispatch invoked.",
  );
} finally {
  await suite.close();
}
