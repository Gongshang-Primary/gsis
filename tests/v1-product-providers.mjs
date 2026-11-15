import assert from "node:assert/strict";
import {
  dispatchProvider,
  secretEquals,
  verifyWebhook,
} from "../v1/runtime/providers.mjs";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import {
  prepareOperation,
  commitOperation,
  one,
} from "../v1/runtime/store.mjs";
import { claimJobs, finishJob, drainOutbox } from "../v1/runtime/jobs.mjs";
assert(await secretEquals("synthetic-secret", "synthetic-secret"));
assert(!(await secretEquals("synthetic-secret", "wrong")));
let calls = 0;
const env = {
  SEND_OWNER: "v1",
  WHATSAPP_ACCESS_TOKEN: "synthetic-token",
  WHATSAPP_PHONE_NUMBER_ID: "123456789",
  PROVIDER_FETCH: async (url, init) => {
    calls++;
    assert.equal(init.headers.authorization, "Bearer synthetic-token");
    return Response.json({ messages: [{ id: "provider-message" }] });
  },
};
const job = {
  provider: "whatsapp",
  to: "+6512345678",
  template: { name: "approved_template", language: { code: "en" } },
};
assert.equal(
  (await dispatchProvider({ ...env, SEND_OWNER: "v0.9" }, job)).code,
  "SENDER_NOT_ACTIVE",
);
assert.equal(calls, 0);
assert.deepEqual(await dispatchProvider(env, job), {
  state: "accepted",
  providerId: "provider-message",
});
assert.equal(calls, 1);
assert.equal(
  (
    await dispatchProvider(
      {
        ...env,
        PROVIDER_FETCH: async () => {
          throw Error("timeout");
        },
      },
      job,
    )
  ).state,
  "uncertain",
);
assert.equal(
  (
    await dispatchProvider(
      { ...env, PROVIDER_FETCH: async () => Response.json({}) },
      job,
    )
  ).state,
  "uncertain",
);
assert.equal(
  (
    await dispatchProvider(
      { ...env, PROVIDER_FETCH: async () => new Response("", { status: 503 }) },
      job,
    )
  ).state,
  "uncertain",
);
assert.equal(
  (
    await dispatchProvider(
      {
        ...env,
        PROVIDER_FETCH: async () => new Response("not-json", { status: 200 }),
      },
      job,
    )
  ).state,
  "uncertain",
  "successful malformed receipt can represent an accepted send",
);
assert.equal(
  (await dispatchProvider({ ...env, DISPATCH_DEADLINE: Date.now() - 1 }, job))
    .code,
  "JOB_LEASE_EXPIRED",
);
const streamStarted = Date.now();
let cancelled = false;
const stalled = await dispatchProvider(
  {
    ...env,
    DISPATCH_DEADLINE: Date.now() + 1100,
    PROVIDER_FETCH: async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode("{"));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  },
  job,
);
assert.equal(stalled.state, "uncertain");
assert(
  Date.now() - streamStarted < 3000,
  "response body must share dispatch deadline",
);
assert(cancelled, "stalled body cancelled");
assert.equal(
  (
    await dispatchProvider(
      {
        SEND_OWNER: "v1",
        GOOGLE_ACCESS_TOKEN: "synthetic",
        PROVIDER_FETCH: async (url) => {
          assert(url.endsWith("abcde_20261113T010000Z"));
          return new Response(null, { status: 204 });
        },
      },
      {
        provider: "google-calendar",
        operation: "delete",
        calendarId: "synthetic",
        eventId: "abcde_20261113T010000Z",
      },
    )
  ).state,
  "delivered",
);
const raw = '{"entry":[]}',
  key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-signing-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
const signature = [
  ...new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
  ),
]
  .map((x) => x.toString(16).padStart(2, "0"))
  .join("");
const req = new Request("https://example.invalid/hook", {
  headers: { "x-hub-signature-256": "sha256=" + signature },
});
await verifyWebhook(
  { WEBHOOK_OWNER: "v1", WHATSAPP_APP_SECRET: "test-signing-secret" },
  "whatsapp",
  req,
  raw,
);
await assert.rejects(
  verifyWebhook(
    { WEBHOOK_OWNER: "v1", WHATSAPP_APP_SECRET: "test-signing-secret" },
    "whatsapp",
    req,
    raw + " ",
  ),
  (e) => e.code === "WEBHOOK_INVALID",
);
await assert.rejects(
  verifyWebhook(
    { WEBHOOK_OWNER: "v0.9", WHATSAPP_APP_SECRET: "test-signing-secret" },
    "whatsapp",
    req,
    raw,
  ),
  (e) => e.code === "WEBHOOK_NOT_ACTIVE",
);
const h = await createDatabase("jobs");
try {
  const now = Date.now();
  const op = await prepareOperation(h.db, {
    schoolId: "s",
    actorId: "a",
    operationId: "save",
    action: "roster.save",
    intent: { a: 1 },
    now,
    validUntil: now + 60000,
  });
  await syntheticAdmission(h.db, op);
  await commitOperation(h.db, op, {
    now,
    result: { saved: true },
    outbox: [
      {
        id: "send-1",
        type: "reminder",
        payload: { staffId: "synthetic" },
        dueAt: now,
      },
    ],
  });
  await h.restart();
  const [a, b] = await Promise.all([
    claimJobs(h.db, { schoolId: "s", now }),
    claimJobs(h.db, { schoolId: "s", now }),
  ]);
  assert.equal(a.length + b.length, 1);
  const leased = [...a, ...b][0];
  await claimJobs(h.db, { schoolId: "s", now: now + 31000 });
  assert.equal(
    (await one(h.db, "SELECT state FROM product_outbox")).state,
    "uncertain",
  );
  assert.equal(
    await finishJob(
      h.db,
      leased,
      { state: "accepted", providerId: "late" },
      now + 31000,
    ),
    false,
    "expired sender cannot overwrite uncertainty",
  );
  assert.equal(
    (await claimJobs(h.db, { schoolId: "s", now: now + 999999 })).length,
    0,
    "uncertain sends never blindly retried",
  );
  const next = await prepareOperation(h.db, {
    schoolId: "s",
    actorId: "a",
    operationId: "next",
    action: "roster.save",
    intent: { a: 2 },
    now: Date.now(),
    validUntil: Date.now() + 60000,
  });
  await syntheticAdmission(h.db, next);
  await commitOperation(h.db, next, {
    now: Date.now(),
    result: { saved: true },
    outbox: [
      { id: "slow-first", type: "slow", payload: {}, dueAt: now },
      { id: "slow-second", type: "slow", payload: {}, dueAt: now },
    ],
  });
  const originalNow = Date.now;
  let controlledNow = originalNow();
  Date.now = () => controlledNow;
  try {
    let handled = 0;
    const drained = await drainOutbox(
      h.db,
      {},
      {
        schoolId: "s",
        limit: 2,
        handlers: {
          slow: async (j, dispatchEnv) => {
            assert(
              dispatchEnv.DISPATCH_DEADLINE > controlledNow + 28000,
              "each dispatch has a fresh lease",
            );
            if (handled++ === 0) controlledNow += 31000;
            return { state: "accepted", providerId: j.job_id };
          },
        },
      },
    );
    assert.equal(drained.length, 2);
    assert.equal(
      drained[0].recorded,
      false,
      "expired first result is not confirmed",
    );
    assert.equal(
      drained[1].recorded,
      true,
      "second job is leased only when dispatch begins",
    );
  } finally {
    Date.now = originalNow;
  }
  console.log(
    "PASS direct provider validation/uncertainty, signature tampering, coexistence owner gate, durable outbox/restart/overlap/late sender",
  );
} finally {
  await h.close();
}
