import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { canonical, query } from "../v1/runtime/store.mjs";
import { dispatchNotification } from "../v1/services/venues/service.mjs";
const runtime = await createDatabase("venues"),
  s = "school",
  now = Date.now(),
  job = {
    school_id: s,
    job_id: "notice",
    operation_id: "op",
    fence: 1,
    payload: { notificationId: "notice", decisionId: "decision" },
  };
let sends = [];
const env = () => ({
  DB: runtime.db,
  SCHOOL_ID: s,
  GSIS_SECRET: "synthetic",
  SEND_OWNER: "v1",
  PUBLIC_ORIGIN: "https://test.invalid",
  EMAIL_PROVIDER: "resend",
  EMAIL_API_TOKEN: "synthetic",
  EMAIL_FROM: "noreply@test.invalid",
  DISPATCH_DEADLINE: now + 60000,
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
            email: staffId + "@test.invalid",
          })),
        },
      });
    },
  },
  PROVIDER_FETCH: async (url, init) => {
    const to = JSON.parse(init.body).to[0];
    sends.push(to);
    if (to === "person2@test.invalid") {
      await runtime.db
        .prepare(
          "UPDATE product_outbox SET lease_until=?,state='uncertain' WHERE job_id='notice'",
        )
        .bind(Date.now() - 1)
        .run();
      throw new Error("synthetic unknown result");
    }
    return Response.json({ id: "receipt-" + to });
  },
});
try {
  const records = [
    ["venues", "room", { id: "room", name: "Room", revision: 1 }],
    [
      "occurrences",
      "booking",
      { id: "booking", status: "confirmed", revision: 1 },
    ],
    [
      "outbox",
      "notice",
      {
        id: "notice",
        kind: "booked",
        recordId: "booking",
        venueId: "room",
        participantIds: ["person1", "person2", "person3"],
        payload: { status: "confirmed", date: "2026-11-16" },
        revision: 1,
      },
    ],
  ];
  await runtime.db.batch(
    records.map(([kind, id, value]) =>
      runtime.db
        .prepare("INSERT INTO venues_records VALUES(?,?,?,?,?,?,?,?)")
        .bind(
          s,
          kind,
          id,
          1,
          null,
          "room",
          value.status || null,
          canonical(value),
        ),
    ),
  );
  await runtime.db
    .prepare(
      "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,lease_until,fence,updated_at) VALUES(?,?,?,?,?,'leased',?,?,?,?)",
    )
    .bind(
      s,
      job.job_id,
      job.operation_id,
      "venues.notify",
      canonical(job.payload),
      now,
      now + 60000,
      1,
      now,
    )
    .run();
  const result = await dispatchNotification(env(), job);
  assert.equal(result.state, "uncertain");
  assert.deepEqual(sends, ["person1@test.invalid", "person2@test.invalid"]);
  let receipts = await query(
    runtime.db,
    "SELECT staff_id,state FROM venues_deliveries WHERE channel LIKE 'email%' ORDER BY staff_id",
  );
  assert.deepEqual(receipts, [
    { staff_id: "person1", state: "accepted" },
    { staff_id: "person2", state: "uncertain" },
  ]);
  await runtime.restart();
  await dispatchNotification(env(), job);
  assert.equal(
    sends.length,
    2,
    "accepted/unknown recipients not resent; expired job cannot start another recipient",
  );
  assert.equal(
    (
      await query(
        runtime.db,
        "SELECT * FROM venues_deliveries WHERE staff_id='person3'",
      )
    ).length,
    0,
  );
  console.log(
    "PASS Venues notifications: durable per-recipient outcome, accepted recipient not resent, unknown preserved after restart, expired lease prevents next recipient",
  );
} finally {
  await runtime.close();
}
