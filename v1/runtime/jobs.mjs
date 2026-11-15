import { query, one, statement } from "./store.mjs";
import { requireValue } from "./errors.mjs";
import { reconcileProviderReceipts } from "./receipts.mjs";
export async function claimJobs(
  db,
  { schoolId, now = Date.now(), limit = 10, leaseMs = 30000 },
) {
  requireValue(
    Number.isInteger(limit) &&
      limit > 0 &&
      limit <= 32 &&
      leaseMs >= 10000 &&
      leaseMs <= 60000,
    "JOB_BOUNDS",
  );
  // A dead sender may have reached its provider. Never retry that ambiguity blindly.
  await statement(
    db,
    `UPDATE product_outbox SET state='uncertain',last_code='LEASE_EXPIRED_OUTCOME_UNKNOWN',updated_at=? WHERE school_id=? AND state='leased' AND lease_until<=?`,
    [now, schoolId, now],
  ).run();
  return query(
    db,
    `UPDATE product_outbox SET state='leased',fence=fence+1,attempts=attempts+1,lease_until=?,updated_at=?
  WHERE school_id=? AND job_id IN(SELECT job_id FROM product_outbox WHERE school_id=? AND state='queued' AND due_at<=? ORDER BY due_at,job_id LIMIT ?) AND state='queued' RETURNING *`,
    [now + leaseMs, now, schoolId, schoolId, now, limit],
  );
}
export async function finishJob(db, job, result, now = Date.now()) {
  requireValue(
    ["accepted", "delivered", "failed", "uncertain", "cancelled"].includes(
      result.state,
    ),
    "JOB_RESULT_INVALID",
    500,
  );
  const retry =
    result.state === "failed" && result.retryable === true && job.attempts < 8;
  const state = retry ? "queued" : result.state,
    delay = Math.min(3600000, 1000 * 2 ** job.attempts);
  const r = await statement(
    db,
    `UPDATE product_outbox SET state=?,provider_id=?,last_code=?,due_at=?,lease_until=NULL,updated_at=? WHERE school_id=? AND job_id=? AND state='leased' AND fence=? AND lease_until>?`,
    [
      state,
      result.providerId ?? null,
      result.code ?? null,
      now + delay,
      now,
      job.school_id,
      job.job_id,
      job.fence,
      now,
    ],
  ).run();
  let lateIdentity = false;
  if (
    r.meta.changes === 0 &&
    typeof result.providerId === "string" &&
    result.providerId.length > 0 &&
    result.providerId.length <= 512
  ) {
    // A late response cannot assert successful dispatch, but its original
    // fenced attempt's provider identity is needed to reconcile a callback.
    const late = await statement(
      db,
      `UPDATE product_outbox SET state='uncertain',provider_id=?,last_code='LATE_PROVIDER_RESULT_UNKNOWN',lease_until=NULL,updated_at=? WHERE school_id=? AND job_id=? AND fence=? AND (provider_id IS NULL OR provider_id=?) AND (state='uncertain' OR (state='leased' AND lease_until<=?))`,
      [
        result.providerId,
        now,
        job.school_id,
        job.job_id,
        job.fence,
        result.providerId,
        now,
      ],
    ).run();
    lateIdentity = late.meta.changes === 1;
  }
  if (r.meta.changes === 1 || lateIdentity)
    await reconcileProviderReceipts({ DB: db, SCHOOL_ID: job.school_id }, now);
  return r.meta.changes === 1;
}
export async function drainOutbox(
  db,
  env,
  { schoolId, handlers, now = Date.now(), limit = 10 },
) {
  requireValue(
    Number.isInteger(limit) && limit > 0 && limit <= 32,
    "JOB_BOUNDS",
  );
  await reconcileProviderReceipts({ ...env, DB: db, SCHOOL_ID: schoolId }, now);
  const results = [];
  for (let index = 0; index < limit; index++) {
    const [job] = await claimJobs(db, {
      schoolId,
      now: Math.max(now, Date.now()),
      limit: 1,
    });
    if (!job) break;
    let result;
    try {
      const handler = handlers[job.type];
      result = handler
        ? await handler(
            { ...job, payload: JSON.parse(job.payload_json) },
            { ...env, DISPATCH_DEADLINE: job.lease_until - 1000 },
          )
        : { state: "failed", code: "JOB_HANDLER_MISSING", retryable: false };
    } catch {
      result = {
        state: "uncertain",
        code: "JOB_EXECUTION_UNCONFIRMED",
        retryable: false,
      };
    }
    const recorded = await finishJob(db, job, result, Date.now());
    results.push({ jobId: job.job_id, state: result.state, recorded });
  }
  await reconcileProviderReceipts(
    { ...env, DB: db, SCHOOL_ID: schoolId },
    Date.now(),
  );
  return results;
}
export async function outboxHealth(db, schoolId, now = Date.now()) {
  const rows = await query(
    db,
    "SELECT state,COUNT(*) AS count,MIN(due_at) AS oldest FROM product_outbox WHERE school_id=? GROUP BY state",
    [schoolId],
  );
  return rows.map((r) => ({
    state: r.state,
    count: r.count,
    oldestAgeMs: Math.max(0, now - r.oldest),
  }));
}
