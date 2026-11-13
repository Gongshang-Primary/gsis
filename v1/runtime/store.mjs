import { ApiError, requireValue, identifier } from "./errors.mjs";
export function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    requireValue(Number.isFinite(value), "INVALID_INPUT");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  requireValue(
    value &&
      typeof value === "object" &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)),
    "INVALID_INPUT",
  );
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
      .join(",") +
    "}"
  );
}
export async function digest(value) {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : new TextEncoder().encode(canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function statement(db, sql, args = []) {
  return db.prepare(sql).bind(...args);
}
export async function query(db, sql, args = []) {
  const r = await statement(db, sql, args).all();
  if (!r.success) throw new ApiError("STORAGE_UNAVAILABLE", 503);
  return r.results;
}
export async function one(db, sql, args = []) {
  return await statement(db, sql, args).first();
}
function opFrom(row) {
  return (
    row && {
      schoolId: row.school_id,
      operationId: row.operation_id,
      actorId: row.actor_id,
      action: row.action,
      digest: row.digest,
      fence: row.fence,
      state: row.state,
      validUntil: row.valid_until,
      createdAt: row.created_at,
      requestDigest: row.request_digest,
      authorityAction: row.authority_action,
      decisionId: row.decision_id,
      receipt: row.receipt_json ? JSON.parse(row.receipt_json) : null,
    }
  );
}
export async function operationStatus(db, schoolId, operationId) {
  identifier(schoolId);
  identifier(operationId);
  return opFrom(
    await one(
      db,
      "SELECT * FROM product_operations WHERE school_id=? AND operation_id=?",
      [schoolId, operationId],
    ),
  );
}
export async function prepareOperation(
  db,
  {
    schoolId,
    actorId,
    operationId,
    action,
    intent,
    now,
    validUntil,
    authorization,
  },
) {
  for (const v of [schoolId, actorId, operationId, action]) identifier(v);
  requireValue(
    Number.isSafeInteger(now) &&
      Number.isSafeInteger(validUntil) &&
      validUntil > now,
    "AUTHORITY_EXPIRED",
    403,
  );
  // The top-level requestId identifies a transport attempt, never a new business intent.
  if (
    intent &&
    typeof intent === "object" &&
    !Array.isArray(intent) &&
    Object.hasOwn(intent, "requestId")
  ) {
    intent = { ...intent };
    delete intent.requestId;
  }
  const hash = await digest({ schoolId, actorId, action, intent });
  await statement(
    db,
    `INSERT OR IGNORE INTO product_operations
   (school_id,operation_id,actor_id,action,digest,state,created_at,valid_until,updated_at,request_digest,authority_action,decision_id)
   VALUES(?,?,?,?,?,'prepared',?,?,?,?,?,?)`,
    [
      schoolId,
      operationId,
      actorId,
      action,
      hash,
      now,
      validUntil,
      now,
      authorization?.requestDigest ?? null,
      authorization?.action ?? null,
      authorization?.decisionId ?? null,
    ],
  ).run();
  const op = await operationStatus(db, schoolId, operationId);
  requireValue(
    op && op.digest === hash && op.actorId === actorId && op.action === action,
    "OPERATION_INTENT_CONFLICT",
    409,
  );
  return op;
}
function assertion(db, sql, args, key) {
  requireValue(
    typeof sql === "string" && /^\s*(SELECT|WITH)\b/i.test(sql),
    "INVALID_GUARD",
    500,
  );
  return statement(
    db,
    `INSERT INTO product_assertions(id,ok) VALUES(?,CASE WHEN COALESCE((SELECT ok FROM (${sql}) LIMIT 1),0) THEN 1 ELSE 0 END)`,
    [key, ...args],
  );
}
export async function commitOperation(
  db,
  op,
  {
    now,
    validUntil = op.validUntil,
    guards = [],
    writes = [],
    result,
    audit = {},
    outbox = [],
    admission,
  },
) {
  const existing = await operationStatus(db, op.schoolId, op.operationId);
  requireValue(
    existing && existing.digest === op.digest,
    "OPERATION_INTENT_CONFLICT",
    409,
  );
  if (existing.state === "committed") return existing.receipt;
  requireValue(
    existing.state === "prepared" && existing.fence === op.fence,
    "OPERATION_ABORTED",
    409,
  );
  requireValue(
    Number.isSafeInteger(now) && Number.isSafeInteger(validUntil),
    "INVALID_INPUT",
  );
  const receipt = {
    state: "committed",
    operationId: op.operationId,
    digest: op.digest,
    fence: op.fence,
    committedAt: now,
    result,
  };
  const keys = [];
  const statements = [];
  const guard = (sql, args = []) => {
    const key = crypto.randomUUID();
    keys.push(key);
    statements.push(assertion(db, sql, args, key));
  };
  guard(
    `SELECT EXISTS(SELECT 1 FROM product_operations WHERE school_id=? AND operation_id=? AND digest=? AND fence=? AND state='prepared' AND valid_until>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) AND ?>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))) AS ok`,
    [op.schoolId, op.operationId, op.digest, op.fence, now, validUntil, now],
  );
  const system =
    admission?.kind === "system" &&
    op.action.startsWith("internal.") &&
    typeof admission.reason === "string";
  if (!system)
    guard(
      `SELECT EXISTS(SELECT 1 FROM product_admissions WHERE school_id=? AND operation_id=? AND fence=? AND digest=? AND state='ready' AND valid_until>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) AND decision_id<>'') AS ok`,
      [op.schoolId, op.operationId, op.fence, op.digest, now],
    );
  for (const g of guards) guard(g.sql, g.args ?? []);
  for (const w of writes) statements.push(statement(db, w.sql, w.args ?? []));
  const decisionId = system
    ? null
    : (admission?.decisionId ??
      (
        await one(
          db,
          "SELECT decision_id FROM product_admissions WHERE school_id=? AND operation_id=?",
          [op.schoolId, op.operationId],
        )
      )?.decision_id);
  statements.push(
    statement(
      db,
      `INSERT INTO product_audit(school_id,event_id,operation_id,actor_id,action,recorded_at,decision_id,details_json) VALUES(?,?,?,?,?,?,?,?)`,
      [
        op.schoolId,
        `op:${op.operationId}`,
        op.operationId,
        op.actorId,
        op.action,
        now,
        decisionId,
        canonical(audit),
      ],
    ),
  );
  requireValue(outbox.length <= 128, "OUTBOX_BOUNDS", 413);
  for (const job of outbox) {
    identifier(job.id);
    identifier(job.type);
    const payload = canonical(job.payload);
    requireValue(payload.length <= 262144, "PAYLOAD_TOO_LARGE", 413);
    statements.push(
      statement(
        db,
        `INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,due_at,updated_at) VALUES(?,?,?,?,?,?,?)`,
        [
          op.schoolId,
          job.id,
          op.operationId,
          job.type,
          payload,
          job.dueAt ?? now,
          now,
        ],
      ),
    );
  }
  statements.push(
    statement(
      db,
      `UPDATE product_operations SET state='committed',receipt_json=?,updated_at=? WHERE school_id=? AND operation_id=? AND fence=? AND state='prepared'`,
      [canonical(receipt), now, op.schoolId, op.operationId, op.fence],
    ),
  );
  for (const key of keys)
    statements.push(
      statement(db, "DELETE FROM product_assertions WHERE id=?", [key]),
    );
  try {
    await db.batch(statements);
  } catch (error) {
    // A parallel matching retry may have won. Return its durable original result only.
    const after = await operationStatus(db, op.schoolId, op.operationId);
    if (after?.state === "committed" && after.digest === op.digest)
      return after.receipt;
    if (/CHECK constraint failed|constraint.*ok=1/i.test(String(error)))
      throw new ApiError(
        "REVISION_CONFLICT",
        409,
        "The record or authority changed. Refresh and review your draft.",
      );
    throw new ApiError(
      "COMMIT_UNCONFIRMED",
      503,
      "The operation could not be confirmed. Check its original operation reference.",
    );
  }
  return receipt;
}
export async function abortOperation(db, op, reason, now) {
  const receipt = {
    state: "terminal-not-committed",
    operationId: op.operationId,
    digest: op.digest,
    reason,
    abortedAt: now,
  };
  await db.batch([
    statement(
      db,
      `UPDATE product_operations SET state='aborted',fence=fence+1,receipt_json=?,updated_at=? WHERE school_id=? AND operation_id=? AND digest=? AND fence=? AND state='prepared'`,
      [
        canonical(receipt),
        now,
        op.schoolId,
        op.operationId,
        op.digest,
        op.fence,
      ],
    ),
    statement(
      db,
      `UPDATE source_changes SET state='aborted' WHERE school_id=? AND operation_id=? AND state='pending' AND EXISTS(SELECT 1 FROM product_operations WHERE school_id=? AND operation_id=? AND digest=? AND state='aborted')`,
      [op.schoolId, op.operationId, op.schoolId, op.operationId, op.digest],
    ),
  ]);
  const row = await operationStatus(db, op.schoolId, op.operationId);
  requireValue(
    row && row.digest === op.digest,
    "OPERATION_INTENT_CONFLICT",
    409,
  );
  return row.receipt;
}
/** Renew computation time only before acquiring authority pins; business revisions still require revalidation. */
export async function renewPreparedOperation(
  db,
  op,
  principal,
  now = Date.now(),
) {
  requireValue(
    principal &&
      !principal.impersonating &&
      principal.schoolId === op.schoolId &&
      principal.actorId === op.actorId &&
      principal.action === op.authorityAction &&
      principal.requestDigest === op.requestDigest &&
      principal.validUntil > now,
    "AUTHORITY_CHANGED",
    409,
  );
  const key = crypto.randomUUID();
  try {
    await db.batch([
      assertion(
        db,
        `SELECT EXISTS(SELECT 1 FROM product_operations WHERE school_id=? AND operation_id=? AND digest=? AND fence=? AND state='prepared') AND NOT EXISTS(SELECT 1 FROM product_admissions WHERE school_id=? AND operation_id=? AND state IN('acquiring','ready','resolving')) AS ok`,
        [
          op.schoolId,
          op.operationId,
          op.digest,
          op.fence,
          op.schoolId,
          op.operationId,
        ],
        key,
      ),
      statement(
        db,
        "UPDATE product_operations SET valid_until=?,decision_id=?,updated_at=? WHERE school_id=? AND operation_id=? AND fence=? AND digest=? AND request_digest=? AND authority_action=?",
        [
          principal.validUntil,
          principal.decisionId,
          now,
          op.schoolId,
          op.operationId,
          op.fence,
          op.digest,
          principal.requestDigest,
          principal.action,
        ],
      ),
      statement(db, "DELETE FROM product_assertions WHERE id=?", [key]),
    ]);
  } catch {
    throw new ApiError(
      "OPERATION_NOT_RENEWABLE",
      409,
      "This operation must be resolved before it can be retried.",
    );
  }
  return operationStatus(db, op.schoolId, op.operationId);
}
