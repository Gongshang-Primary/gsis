import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { handle, notificationIntent } from "../v1/services/lord/service.mjs";
import { scheduled } from "../v1/services/lord/jobs.mjs";
import { one, query } from "../v1/runtime/store.mjs";
const h = await createDatabase("lord"),
  school = "synthetic-school",
  now = Date.now(),
  validUntil = now + 86400000;
let seq = 0,
  allowed = true,
  active = true,
  monitor = false,
  sends = [];
const core = {
  async fetch(req) {
    const b = await req.json(),
      path = new URL(req.url).pathname;
    return Response.json({
      ok: true,
      data:
        path === "/internal/dispatch-check"
          ? { allowed, decisionId: "fresh-decision" }
          : path.endsWith("/release")
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
const contacts = {
  async fetch(req) {
    const b = await req.json();
    if (b.purpose === "lord.notification") {
      assert.deepEqual(b.staffIds, ["staff"]);
      assert.equal(b.decisionId, "fresh-decision");
    } else assert.equal(b.purpose, "lord");
    return Response.json({
      ok: true,
      data: {
        schoolId: school,
        revision: "same-facts",
        asOf: Date.now(),
        staff: [
          {
            staffId: "staff",
            name: "Synthetic Teacher",
            active,
            email: "current@example.test",
            mobile: "+6581234567",
          },
        ],
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
  CONTACTS: contacts,
  SERVICE_NAME: "lord",
  SCHOOL_ID: school,
  GSIS_SECRET: "synthetic-test-only",
  SCHEDULER_OWNER: "v1",
  SEND_OWNER: "v1",
  LORD_SCHOOL_WHATSAPP_AGREEMENT: "true",
  EMAIL_PROVIDER: "resend",
  EMAIL_API_TOKEN: "synthetic",
  EMAIL_FROM: "test@example.test",
  WHATSAPP_ACCESS_TOKEN: "synthetic",
  WHATSAPP_PHONE_NUMBER_ID: "123456789",
  TELEGRAM_BOT_TOKEN: "123:synthetic",
  LORD_MONITOR_TELEGRAM_CHAT_ID: monitor ? "-12345" : undefined,
  PROVIDER_FETCH: async (url, init) => {
    sends.push({ url, body: JSON.parse(init.body) });
    if (url.includes("telegram"))
      return Response.json({ ok: true, result: { message_id: 42 } });
    return url.includes("resend")
      ? new Response("Provider outcome unknown", { status: 503 })
      : Response.json({ messages: [{ id: "synthetic-wa" }] });
  },
});
const call = (path, data = {}) => {
  const body = { operationId: "notify-" + ++seq, ...data };
  return handle({
    env: env(),
    path,
    body,
    method: "POST",
    principal: p,
    now: Date.now(),
    request: new Request("https://example.test" + path, {
      method: "POST",
      body: JSON.stringify(body),
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
      "old@example.test",
      "+6587654321",
      "same-facts",
      now,
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
    key: "notificationTemplates",
    revision: 0,
    value: {
      created: {
        name: "synthetic_approved_template",
        language: { code: "en" },
      },
    },
  });
  const date = new Date(now + 86400000 + 8 * 3600000)
      .toISOString()
      .slice(0, 10),
    booking = () =>
      call("/bookings", {
        date,
        startPeriod: seq * 2,
        endPeriod: seq * 2,
        resourceId: "cart",
        quantity: 1,
        classOrActivity: "Synthetic class",
        subject: "Science",
      });
  const b = await booking();
  assert.equal(
    (
      await notificationIntent(env(), {
        schoolId: school,
        bookingId: b.bookingId,
        kind: "created",
      })
    ).state,
    "ready",
    "Existing school agreement does not add new individual consent",
  );
  await scheduled({ env: env(), now: Date.now() + 1000 });
  assert.equal(sends.length, 2);
  assert.equal(
    sends.find((s) => s.url.includes("resend")).body.to[0],
    "current@example.test",
    "Fresh Contacts observation wins over cache",
  );
  assert.equal(
    sends.find((s) => s.url.includes("facebook")).body.to,
    "+6581234567",
  );
  const jobs = await query(
    h.db,
    "SELECT state,payload_json FROM product_outbox WHERE type='lord.booking-notification'",
  );
  assert.equal(
    jobs.find((j) => JSON.parse(j.payload_json).channel === "email").state,
    "uncertain",
  );
  assert.equal(
    jobs.find((j) => JSON.parse(j.payload_json).channel === "whatsapp").state,
    "accepted",
  );
  await h.restart();
  await scheduled({ env: env(), now: Date.now() + 2000 });
  assert.equal(
    sends.length,
    2,
    "Uncertain sends are not blindly repeated after restart",
  );
  await booking();
  allowed = false;
  await scheduled({ env: env(), now: Date.now() + 3000 });
  assert.equal(sends.length, 2, "Revoked current authority prevents dispatch");
  allowed = true;
  await booking();
  active = false;
  await scheduled({ env: env(), now: Date.now() + 4000 });
  assert.equal(sends.length, 2, "Inactive recipient prevents dispatch");
  assert.equal(
    (
      await one(
        h.db,
        "SELECT COUNT(*) n FROM product_outbox WHERE state='cancelled'",
      )
    ).n,
    4,
  );
  active = true;
  monitor = true;
  await call("/reference/refresh");
  await scheduled({ env: env(), now: Date.now() + 5000 });
  assert.equal(sends.length, 2, "Future bookings without overdue custody do not create an administrative alert");
  await scheduled({ env: env(), now: Date.now() + 6000 });
  assert.equal(sends.length, 2, "Repeated scans do not substitute hourly summaries for overdue alerts");
  console.log(
    "PASS LORD notifications: channel-specific durable jobs, school agreement preserved, final Core and Contacts checks, current recipient wins, provider uncertainty survives restart without duplicate, authority/recipient revocation suppress sends.",
  );
} finally {
  await h.close();
}
