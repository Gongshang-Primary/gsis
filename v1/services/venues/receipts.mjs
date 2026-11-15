import { ApiError } from "../../runtime/errors.mjs";
import { one, query } from "../../runtime/store.mjs";
import {
  recordProviderReceipt as recordCommonReceipt,
  latestProviderReceipt,
} from "../../runtime/receipts.mjs";
const need = (value, code, status = 400) => {
  if (!value) throw new ApiError(code, status);
};
const latestEvent =
  "SELECT event_id FROM product_provider_events WHERE school_id=? AND provider='whatsapp' AND provider_id=? ORDER BY CASE status WHEN 'read' THEN 4 WHEN 'delivered' THEN 3 WHEN 'failed' THEN 2 WHEN 'sent' THEN 1 END DESC,event_at DESC,event_id DESC LIMIT 1";
export function deliveryAggregate(rows) {
  const states = rows.map((r) => r.state);
  if (!states.length) return "cancelled";
  if (states.some((s) => ["uncertain", "sending", "queued"].includes(s)))
    return "uncertain";
  if (states.includes("failed")) return "failed";
  if (states.includes("accepted")) return "accepted";
  return states.every((s) => s === "delivered") ? "delivered" : "uncertain";
}
/** Only the Roster verified-callback named binding can invoke this entrypoint. */
export async function recordProviderReceipt(env, input, now = Date.now()) {
  need(input?.schoolId === env.SCHOOL_ID, "SCHOOL_MISMATCH", 403);
  need(input.provider === "whatsapp", "PROVIDER_UNSUPPORTED");
  const receipt = await recordCommonReceipt(env, input, now);
  const reconciliation = await reconcileProviderReceipts(
    env,
    now,
    input.providerId,
  );
  return { ...receipt, reconciliation };
}
/** Reads immutable receipt evidence only; this function never calls a sending provider. */
export async function reconcileProviderReceipts(
  env,
  now = Date.now(),
  providerId = null,
) {
  const ids = providerId
    ? [{ provider_id: providerId }]
    : await query(
        env.DB,
        "SELECT DISTINCT e.provider_id FROM product_provider_events e JOIN venues_deliveries d ON d.school_id=e.school_id AND d.channel='whatsapp' AND d.provider_id=e.provider_id WHERE e.school_id=? AND e.provider='whatsapp' AND e.matched_at IS NULL ORDER BY e.provider_id LIMIT 64",
        [env.SCHOOL_ID],
      );
  let matched = 0;
  for (const item of ids) {
    const evidence = await latestProviderReceipt(
      env.DB,
      env.SCHOOL_ID,
      "whatsapp",
      item.provider_id,
    );
    if (!evidence) continue;
    const rows = await query(
      env.DB,
      "SELECT notification_id,staff_id,dispatch_fence,provider_event_id FROM venues_deliveries WHERE school_id=? AND channel='whatsapp' AND provider_id=? LIMIT 129",
      [env.SCHOOL_ID, item.provider_id],
    );
    need(rows.length <= 128, "RECEIPT_MATCH_BOUNDS", 413);
    if (!rows.length) continue;
    const status = evidence.status,
      state =
        status === "read" || status === "delivered"
          ? "delivered"
          : status === "failed"
            ? "failed"
            : "accepted";
    const statements = [];
    for (const row of rows) {
      statements.push(
        env.DB.prepare(
          "UPDATE venues_deliveries SET state=?,provider_status=?,provider_occurred_at=?,provider_event_id=?,reason_code=?,updated_at=? WHERE school_id=? AND notification_id=? AND staff_id=? AND channel='whatsapp' AND provider_id=? AND dispatch_fence=? AND (provider_event_id IS NULL OR provider_event_id<>?) AND ?=(" +
            latestEvent +
            ")",
        ).bind(
          state,
          status,
          evidence.event_at,
          evidence.event_id,
          status === "failed" ? "PROVIDER_DELIVERY_FAILED" : null,
          now,
          env.SCHOOL_ID,
          row.notification_id,
          row.staff_id,
          item.provider_id,
          row.dispatch_fence,
          evidence.event_id,
          evidence.event_id,
          env.SCHOOL_ID,
          item.provider_id,
        ),
      );
      statements.push(
        env.DB.prepare(
          "INSERT INTO venues_receipt_reconciliation(school_id,notification_id,updated_at) VALUES(?,?,?) ON CONFLICT(school_id,notification_id) DO UPDATE SET updated_at=excluded.updated_at,revision=revision+1",
        ).bind(env.SCHOOL_ID, row.notification_id, now),
      );
    }
    statements.push(
      env.DB.prepare(
        "UPDATE product_provider_events SET matched_at=COALESCE(matched_at,?) WHERE school_id=? AND provider='whatsapp' AND provider_id=? AND EXISTS(SELECT 1 FROM venues_deliveries d WHERE d.school_id=? AND d.channel='whatsapp' AND d.provider_id=? AND d.provider_event_id=(" +
          latestEvent +
          "))",
      ).bind(
        now,
        env.SCHOOL_ID,
        item.provider_id,
        env.SCHOOL_ID,
        item.provider_id,
        env.SCHOOL_ID,
        item.provider_id,
      ),
    );
    await env.DB.batch(statements);
    matched += rows.length;
  }
  const dirty = await query(
    env.DB,
    "SELECT r.notification_id,r.revision,j.fence,j.state FROM venues_receipt_reconciliation r JOIN product_outbox j ON j.school_id=r.school_id AND j.job_id=r.notification_id JOIN venues_notification_progress p ON p.school_id=r.school_id AND p.notification_id=r.notification_id AND p.job_fence=j.fence AND p.complete=1 WHERE r.school_id=? AND j.state IN('accepted','delivered','failed','uncertain') ORDER BY r.updated_at LIMIT 64",
    [env.SCHOOL_ID],
  );
  let aggregated = 0;
  for (const note of dirty) {
    const deliveries = await query(
        env.DB,
        "SELECT state FROM venues_deliveries WHERE school_id=? AND notification_id=?",
        [env.SCHOOL_ID, note.notification_id],
      ),
      state = deliveryAggregate(deliveries);
    const exists =
      "EXISTS(SELECT 1 FROM product_outbox j JOIN venues_notification_progress p ON p.school_id=j.school_id AND p.notification_id=j.job_id AND p.job_fence=j.fence AND p.complete=1 WHERE j.school_id=? AND j.job_id=? AND j.fence=? AND j.state IN('accepted','delivered','failed','uncertain')) AND EXISTS(SELECT 1 FROM venues_receipt_reconciliation r WHERE r.school_id=? AND r.notification_id=? AND r.revision=?)";
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE venues_records SET revision=revision+1,status=?,data_json=json_set(data_json,'$.status',?,'$.revision',revision+1) WHERE school_id=? AND kind='outbox' AND record_id=? AND status<>? AND " +
          exists,
      ).bind(
        state,
        state,
        env.SCHOOL_ID,
        note.notification_id,
        state,
        env.SCHOOL_ID,
        note.notification_id,
        note.fence,
        env.SCHOOL_ID,
        note.notification_id,
        note.revision,
      ),
      env.DB.prepare(
        "UPDATE product_outbox SET state=?,last_code=?,updated_at=? WHERE school_id=? AND job_id=? AND fence=? AND " +
          exists,
      ).bind(
        state,
        state === "failed" ? "NOTIFICATION_DELIVERY_FAILED" : null,
        now,
        env.SCHOOL_ID,
        note.notification_id,
        note.fence,
        env.SCHOOL_ID,
        note.notification_id,
        note.fence,
        env.SCHOOL_ID,
        note.notification_id,
        note.revision,
      ),
      env.DB.prepare(
        "DELETE FROM venues_receipt_reconciliation WHERE school_id=? AND notification_id=? AND " +
          exists,
      ).bind(
        env.SCHOOL_ID,
        note.notification_id,
        env.SCHOOL_ID,
        note.notification_id,
        note.fence,
        env.SCHOOL_ID,
        note.notification_id,
        note.revision,
      ),
    ]);
    aggregated++;
  }
  return { matched, aggregated };
}
