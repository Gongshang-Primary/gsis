import { ApiError, requireValue, identifier } from "./errors.mjs";
import { digest, one, query, statement } from "./store.mjs";

const statuses = new Set(["sent", "failed", "delivered", "read"]);
const eventOrder =
  "CASE status WHEN 'read' THEN 4 WHEN 'delivered' THEN 3 WHEN 'failed' THEN 2 ELSE 1 END DESC,event_at DESC,event_id DESC";
// The two Roster types have always used WhatsApp, including historical payloads
// without a channel field. Do not broaden this to email or receipt-fanout jobs.
const whatsappJob =
  "(type IN ('roster-notification','roster-inbox-reply') OR json_extract(payload_json,'$.channel')='whatsapp' OR json_extract(payload_json,'$.provider')='whatsapp')";

/** Called by the verified webhook owner or its bound receipt-only entrypoints. */
export async function recordProviderReceipt(env, input, now = Date.now()) {
  requireValue(
    input && typeof input === "object" && !Array.isArray(input),
    "PROVIDER_RECEIPT_INVALID",
  );
  requireValue(
    Object.keys(input).every((key) =>
      [
        "schoolId",
        "provider",
        "providerId",
        "eventId",
        "status",
        "occurredAt",
      ].includes(key),
    ),
    "PROVIDER_RECEIPT_INVALID",
  );
  requireValue(input.schoolId === env.SCHOOL_ID, "SCHOOL_SCOPE_DENIED", 403);
  const schoolId = identifier(input.schoolId, "schoolId");
  requireValue(
    input.provider === "whatsapp" && statuses.has(input.status),
    "PROVIDER_RECEIPT_INVALID",
  );
  requireValue(
    typeof input.providerId === "string" &&
      /^[A-Za-z0-9._:@/+\-=]{1,512}$/.test(input.providerId),
    "PROVIDER_RECEIPT_INVALID",
  );
  const eventId = identifier(input.eventId, "eventId");
  requireValue(
    Number.isSafeInteger(now) &&
      now >= 0 &&
      Number.isSafeInteger(input.occurredAt) &&
      input.occurredAt >= 0 &&
      input.occurredAt <= now + 60000,
    "PROVIDER_RECEIPT_INVALID",
  );
  const contentDigest = await digest({
    schoolId,
    provider: input.provider,
    providerId: input.providerId,
    status: input.status,
    occurredAt: input.occurredAt,
  });
  const previous = await one(
    env.DB,
    "SELECT digest FROM product_provider_events WHERE school_id=? AND provider=? AND event_id=?",
    [schoolId, input.provider, eventId],
  );
  requireValue(
    !previous || previous.digest === contentDigest,
    "PROVIDER_EVENT_CONFLICT",
    409,
  );
  // A concurrent reuse with changed content fails the NOT NULL constraint atomically.
  try {
    await statement(
      env.DB,
      `INSERT INTO product_provider_events(school_id,provider,event_id,provider_id,status,event_at,digest,received_at,matched_at) VALUES(?,?,?,?,?,?,?,?,NULL)
      ON CONFLICT(school_id,provider,event_id) DO UPDATE SET digest=CASE WHEN product_provider_events.digest=excluded.digest THEN product_provider_events.digest ELSE NULL END`,
      [
        schoolId,
        input.provider,
        eventId,
        input.providerId,
        input.status,
        input.occurredAt,
        contentDigest,
        now,
      ],
    ).run();
  } catch (error) {
    if (
      /NOT NULL constraint failed: product_provider_events.digest/.test(
        String(error),
      )
    )
      throw new ApiError("PROVIDER_EVENT_CONFLICT", 409);
    throw error;
  }
  await reconcileProviderReceipts(env, now);
  const current = await latestProviderReceipt(
    env.DB,
    schoolId,
    input.provider,
    input.providerId,
  );
  return {
    state: "recorded",
    eventId,
    providerId: input.providerId,
    status: current.status,
    occurredAt: current.event_at,
    duplicate: !!previous,
  };
}

/** Delivery/read outrank failure and sent, regardless of callback arrival order. */
export async function latestProviderReceipt(
  db,
  schoolId,
  provider,
  providerId,
) {
  return one(
    db,
    `SELECT school_id,provider,event_id,provider_id,status,event_at,received_at FROM product_provider_events WHERE school_id=? AND provider=? AND provider_id=? ORDER BY ${eventOrder} LIMIT 1`,
    [schoolId, provider, providerId],
  );
}

/** Reconcile only known provider identities; unmatched events wait durably for the sender receipt. */
export async function reconcileProviderReceipts(env, now = Date.now()) {
  const schoolId = identifier(env.SCHOOL_ID, "schoolId");
  const pending = await query(
    env.DB,
    `SELECT DISTINCT e.provider_id FROM product_provider_events e WHERE e.school_id=? AND e.provider='whatsapp' AND e.matched_at IS NULL AND EXISTS(
    SELECT 1 FROM product_outbox WHERE school_id=e.school_id AND provider_id=e.provider_id AND state IN ('accepted','uncertain','failed','delivered') AND ${whatsappJob}) ORDER BY e.provider_id LIMIT 100`,
    [schoolId],
  );
  let matched = 0;
  for (const item of pending) {
    const receipt = await latestProviderReceipt(
      env.DB,
      schoolId,
      "whatsapp",
      item.provider_id,
    );
    const delivered = ["delivered", "read"].includes(receipt.status);
    const nextState = delivered
      ? "delivered"
      : receipt.status === "failed"
        ? "failed"
        : "accepted";
    const code = {
      read: "PROVIDER_READ",
      delivered: "PROVIDER_DELIVERED",
      failed: "PROVIDER_DELIVERY_FAILED",
      sent: "PROVIDER_SENT",
    }[receipt.status];
    const eligible = delivered
      ? "('accepted','uncertain','failed','delivered')"
      : receipt.status === "failed"
        ? "('accepted','uncertain','failed')"
        : "('accepted','uncertain')";
    const observedStatuses =
      receipt.status === "read"
        ? "('sent','failed','delivered','read')"
        : receipt.status === "delivered"
          ? "('sent','failed','delivered')"
          : receipt.status === "failed"
            ? "('sent','failed')"
            : "('sent')";
    await env.DB.batch([
      statement(
        env.DB,
        `UPDATE product_outbox SET state=?,last_code=CASE WHEN last_code='PROVIDER_READ' THEN last_code ELSE ? END,updated_at=?,lease_until=NULL WHERE school_id=? AND provider_id=? AND state IN ${eligible} AND ${whatsappJob}`,
        [nextState, code, now, schoolId, item.provider_id],
      ),
      statement(
        env.DB,
        `UPDATE product_provider_events SET matched_at=? WHERE school_id=? AND provider='whatsapp' AND provider_id=? AND received_at<=? AND status IN ${observedStatuses} AND EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND provider_id=? AND state IN ('accepted','uncertain','failed','delivered') AND ${whatsappJob})`,
        [now, schoolId, item.provider_id, now, schoolId, item.provider_id],
      ),
    ]);
    matched++;
  }
  return { matched };
}
