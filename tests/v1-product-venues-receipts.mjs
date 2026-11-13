import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { canonical, one, query } from "../v1/runtime/store.mjs";
import {
  recordProviderReceipt,
  reconcileProviderReceipts,
  scheduled,
} from "../v1/services/venues/service.mjs";
const runtime = await createDatabase("venues"),
  school = "school",
  now = Date.now();
let sends = 0;
const env = () => ({
  DB: runtime.db,
  SCHOOL_ID: school,
  SERVICE_NAME: "venues",
  GSIS_SECRET: "synthetic",
  SCHEDULER_OWNER: "v1",
  SEND_OWNER: "v1",
  PUBLIC_ORIGIN: "https://test.invalid",
  WHATSAPP_ACCESS_TOKEN: "synthetic",
  WHATSAPP_PHONE_NUMBER_ID: "123456789",
  VENUES_WHATSAPP_TEMPLATE: canonical({
    name: "venue_notice",
    language: "en",
    fields: [
      "recipient_name",
      "event",
      "venue",
      "date",
      "status",
      "manage_url",
    ],
  }),
  CORE: {
    async fetch() {
      return Response.json({
        ok: true,
        data: { allowed: true, decisionId: "decision" },
      });
    },
  },
  CONTACTS: {
    async fetch(r) {
      const x = await r.json();
      return Response.json({
        ok: true,
        data: {
          staff: x.staffIds.map((staffId) => ({
            staffId,
            name: staffId,
            active: true,
            mobile: "6591234567",
          })),
        },
      });
    },
  },
  PROVIDER_FETCH: async () => {
    sends++;
    await recordProviderReceipt(
      env(),
      event("early-read", "provider-early", "read"),
    );
    return Response.json({ messages: [{ id: "provider-early" }] });
  },
});
const event = (eventId, providerId, status, occurredAt = now) => ({
  schoolId: school,
  provider: "whatsapp",
  providerId,
  eventId,
  status,
  occurredAt,
});
async function seedNotice(
  id,
  {
    state = "accepted",
    complete = 1,
    providerId = "provider-" + id,
    email = false,
  } = {},
) {
  const n = {
    id,
    kind: "booked",
    recordId: "booking",
    venueId: "room",
    participantIds: ["staff"],
    payload: { status: "confirmed", date: "2026-11-16" },
    status: state,
    revision: 1,
  };
  await runtime.db.batch([
    runtime.db
      .prepare("INSERT INTO venues_records VALUES(?,?,?,?,?,?,?,?)")
      .bind(school, "outbox", id, 1, null, "room", state, canonical(n)),
    runtime.db
      .prepare(
        "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,fence,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        school,
        id,
        "op-" + id,
        "venues.notify",
        canonical({ notificationId: id, decisionId: "decision" }),
        state,
        now,
        1,
        now,
      ),
    runtime.db
      .prepare("INSERT INTO venues_notification_progress VALUES(?,?,?,?)")
      .bind(school, id, 1, complete),
    runtime.db
      .prepare(
        "INSERT INTO venues_deliveries(school_id,notification_id,staff_id,channel,state,provider_id,updated_at,dispatch_fence) VALUES(?,?,?,'whatsapp','accepted',?,?,1)",
      )
      .bind(school, id, "staff", providerId, now),
    ...(email
      ? [
          runtime.db
            .prepare(
              "INSERT INTO venues_deliveries(school_id,notification_id,staff_id,channel,state,provider_id,updated_at,dispatch_fence) VALUES(?,?,?,'email0','accepted',?,?,1)",
            )
            .bind(school, id, "staff", "mail-" + id, now),
        ]
      : []),
  ]);
}
try {
  await recordProviderReceipt(
    env(),
    event("early-delivery", "provider-mixed", "delivered"),
  );
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT matched_at FROM product_provider_events WHERE event_id='early-delivery'",
      )
    ).matched_at,
    null,
  );
  await runtime.restart();
  await seedNotice("mixed", { email: true });
  await reconcileProviderReceipts(env());
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT state FROM venues_deliveries WHERE notification_id='mixed' AND channel='whatsapp'",
      )
    ).state,
    "delivered",
  );
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT state FROM product_outbox WHERE job_id='mixed'",
      )
    ).state,
    "accepted",
    "WhatsApp delivery cannot claim email delivery",
  );
  await recordProviderReceipt(
    env(),
    event("early-delivery", "provider-mixed", "delivered"),
  );
  await Promise.all([
    recordProviderReceipt(
      env(),
      event("read-proof", "provider-mixed", "read", now + 1),
    ),
    recordProviderReceipt(
      env(),
      event("late-failed", "provider-mixed", "failed", now + 2),
    ),
    recordProviderReceipt(
      env(),
      event("late-sent", "provider-mixed", "sent", now + 3),
    ),
  ]);
  await reconcileProviderReceipts(env());
  const delivered = await one(
    runtime.db,
    "SELECT state,provider_status FROM venues_deliveries WHERE notification_id='mixed' AND channel='whatsapp'",
  );
  assert.deepEqual(delivered, { state: "delivered", provider_status: "read" });
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT COUNT(*) AS n FROM product_provider_events WHERE event_id='early-delivery'",
      )
    ).n,
    1,
  );
  await assert.rejects(
    recordProviderReceipt(env(), {
      ...event("foreign", "provider-mixed", "failed"),
      schoolId: "other-school",
    }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    recordProviderReceipt(env(), {
      ...event("email", "provider-mixed", "failed"),
      provider: "email",
    }),
    (e) => e.code === "PROVIDER_UNSUPPORTED",
  );
  await seedNotice("interrupted", { state: "uncertain", complete: 0 });
  await recordProviderReceipt(
    env(),
    event("partial-success", "provider-interrupted", "delivered"),
  );
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT state FROM product_outbox WHERE job_id='interrupted'",
      )
    ).state,
    "uncertain",
    "recipient evidence cannot finish an interrupted multi-recipient job",
  );
  await runtime.db.batch([
    runtime.db
      .prepare("INSERT INTO venues_records VALUES(?,?,?,?,?,?,?,?)")
      .bind(
        school,
        "venues",
        "room",
        1,
        null,
        null,
        null,
        canonical({ id: "room", name: "Room", revision: 1 }),
      ),
    runtime.db
      .prepare("INSERT INTO venues_records VALUES(?,?,?,?,?,?,?,?)")
      .bind(
        school,
        "occurrences",
        "booking",
        1,
        null,
        "room",
        "confirmed",
        canonical({ id: "booking", status: "confirmed", revision: 1 }),
      ),
  ]);
  await seedNotice("send", {
    state: "queued",
    complete: 0,
    providerId: "old-provider",
  });
  await runtime.db
    .prepare(
      "UPDATE venues_deliveries SET state='queued' WHERE notification_id='send'",
    )
    .run();
  await scheduled({ env: env() });
  assert.equal(sends, 1);
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT state FROM product_outbox WHERE job_id='send'",
      )
    ).state,
    "delivered",
  );
  assert.deepEqual(
    await one(
      runtime.db,
      "SELECT state,provider_id,provider_status FROM venues_deliveries WHERE notification_id='send'",
    ),
    {
      state: "delivered",
      provider_id: "provider-early",
      provider_status: "read",
    },
  );
  await recordProviderReceipt(
    env(),
    event("old-provider-late", "old-provider", "failed"),
  );
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT state FROM venues_deliveries WHERE notification_id='send'",
      )
    ).state,
    "delivered",
    "old attempt callback cannot overwrite the new provider identity",
  );
  await runtime.restart();
  await recordProviderReceipt(
    env(),
    event("provider-late-failure", "provider-early", "failed", now + 10),
  );
  await scheduled({ env: env() });
  assert.equal(sends, 1);
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT state FROM product_outbox WHERE job_id='send'",
      )
    ).state,
    "delivered",
  );
  assert.equal(
    (
      await query(
        runtime.db,
        "SELECT * FROM product_outbox WHERE type<>'venues.notify'",
      )
    ).length,
    0,
    "receipts never enqueue sends",
  );
  console.log(
    "PASS Venues verified receipts: early callback before sender receipt, restart, idempotency, concurrent reordered states, channel/school isolation, mixed-channel honest aggregate, interrupted dispatch stays uncertain, new-attempt identity, no extra sends",
  );
} finally {
  await runtime.close();
}
