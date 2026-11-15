import assert from "node:assert/strict";
import { productSuite, origin } from "./v1-product/suite.mjs";
const signingSecret = "synthetic-provider-signing-secret",
  phone = "123456789";
const suite = await productSuite({
  bindings: {
    SCHEDULER_OWNER: "v1",
    WEBHOOK_OWNER: "v1",
    WHATSAPP_APP_SECRET: signingSecret,
    WHATSAPP_PHONE_NUMBER_ID: phone,
  },
});
try {
  const lord = await suite.db("lord"),
    venues = await suite.db("venues"),
    now = Date.now();
  await lord
    .prepare(
      "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,provider_id,updated_at) VALUES('synthetic-school','lord-notice','booking-operation','lord.booking-notification',?,'accepted',?,'wamid.shared-message',?)",
    )
    .bind(JSON.stringify({ channel: "whatsapp" }), now, now)
    .run();
  await venues
    .prepare(
      "INSERT INTO venues_deliveries(school_id,notification_id,staff_id,channel,state,provider_id,updated_at) VALUES('synthetic-school','venue-notice','synthetic-staff','whatsapp','accepted','wamid.shared-message',?)",
    )
    .bind(now)
    .run();
  const raw = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: phone },
              statuses: [
                {
                  id: "wamid.shared-message",
                  status: "delivered",
                  timestamp: String(Math.floor(now / 1000)),
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  async function send(body, valid = true) {
    const bytes = new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
      ),
      signature = [...bytes]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
    return suite.mf.dispatchFetch(origin + "/webhooks/whatsapp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=" + (valid ? signature : "0".repeat(64)),
      },
      body,
    });
  }
  assert.equal((await send(raw, false)).status, 401);
  assert.equal(
    (await send(raw.replace(phone, "999999999"))).status,
    403,
    "signed callback for a different phone cannot enter this school",
  );
  const first = await send(raw);
  assert.equal(first.status, 200, await first.text());
  assert.equal((await send(raw)).status, 200);
  const roster = await suite.db("roster");
  assert.equal(
    (
      await roster
        .prepare(
          "SELECT COUNT(*) n FROM product_outbox WHERE type='roster-provider-receipt'",
        )
        .first()
    ).n,
    2,
    "one durable job per owner despite repeated signed delivery",
  );
  await suite.trigger("roster");
  assert.equal(
    (
      await lord
        .prepare("SELECT state FROM product_outbox WHERE job_id='lord-notice'")
        .first()
    ).state,
    "delivered",
  );
  assert.equal(
    (
      await venues
        .prepare(
          "SELECT state FROM venues_deliveries WHERE notification_id='venue-notice'",
        )
        .first()
    ).state,
    "delivered",
  );
  assert.equal(
    (
      await roster
        .prepare(
          "SELECT COUNT(*) n FROM product_outbox WHERE type='roster-provider-receipt' AND state='delivered'",
        )
        .first()
    ).n,
    2,
  );
  assert.equal(
    (
      await suite.request(null, "lord", "/internal/provider-receipt", {
        method: "POST",
        body: {},
      })
    ).status,
    404,
  );
  console.log(
    "PASS actual signed gateway webhook→durable Roster fanout→named LORD/Venues receipt entrypoints; duplicate/tampered callbacks and public internal-route denial; zero provider sends",
  );
} finally {
  await suite.close();
}
