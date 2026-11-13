import { ApiError } from "./errors.mjs";
import {
  digest,
  one,
  query,
  statement,
  operationStatus,
  abortOperation,
} from "./store.mjs";

export async function secureEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("gsis-constant-time-comparison-v1"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(a),
  );
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(b));
}
export async function requireMembership(env, request) {
  if (!env.GSIS_SECRET)
    throw new ApiError(
      "CONFIGURATION_REQUIRED",
      503,
      "Backend integration secret is not configured.",
    );
  if (
    !(await secureEqual(request.headers.get("x-gsis-secret"), env.GSIS_SECRET))
  )
    throw new ApiError(
      "SERVICE_DENIED",
      403,
      "Integration authentication failed.",
    );
}
export async function serviceCall(env, service, path, body) {
  const binding = env[service.toUpperCase()];
  if (!binding?.fetch || !env.GSIS_SECRET)
    throw new ApiError(
      "DEPENDENCY_UNAVAILABLE",
      503,
      "An owning service is unavailable.",
      { retryable: true },
    );
  let response;
  try {
    response = await binding.fetch(
      new Request(`https://gsis.internal${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gsis-secret": env.GSIS_SECRET,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      }),
    );
  } catch {
    throw new ApiError(
      "DEPENDENCY_UNAVAILABLE",
      503,
      "An owning service did not confirm its result.",
      { retryable: true },
    );
  }
  let result;
  try {
    const reader = response.body?.getReader();
    let size = 0,
      chunks = [];
    if (!reader) throw Error("Empty response");
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1048576) {
        await reader.cancel();
        throw Error("Response exceeds bound");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      bytes.set(part, offset);
      offset += part.length;
    }
    result = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(
      "DEPENDENCY_INVALID",
      503,
      "An owning service returned an invalid response.",
      { retryable: true },
    );
  }
  if (!response.ok || result.ok === false)
    throw new ApiError(
      result.error?.code ?? result.reasonCode ?? "DEPENDENCY_UNAVAILABLE",
      response.status || 503,
      result.error?.message ?? "The owning service refused this operation.",
      { retryable: response.status >= 500 || response.status === 409 },
    );
  return result.ok === true ? result.data : result;
}
export async function inspectDecision(env, decisionId, expected = {}) {
  if (env.SERVICE_NAME === "core") {
    const row = await one(
      env.DB,
      "SELECT principal_json,descriptor_json,valid_until FROM core_evidence WHERE school_id=? AND decision_id=?",
      [expected.schoolId ?? env.SCHOOL_ID, decisionId],
    );
    if (!row || row.valid_until <= (expected.now ?? Date.now()))
      throw new ApiError(
        "AUTHORITY_CHANGED",
        409,
        "Decision evidence is no longer current.",
        { retryable: true },
      );
    const principal = JSON.parse(row.principal_json),
      descriptor = JSON.parse(row.descriptor_json);
    if (
      (expected.actions && !expected.actions.includes(descriptor.action)) ||
      (expected.operationId &&
        descriptor.operationId !== expected.operationId) ||
      (expected.service && descriptor.service !== expected.service)
    )
      throw new ApiError(
        "SERVICE_DENIED",
        403,
        "Decision is bound to another operation.",
      );
    return { principal, descriptor };
  }
  return serviceCall(env, "core", "/internal/decision", {
    decisionId,
    ...expected,
  });
}
/** A queued owner change closes new admission immediately; existing pins remain durable. */
export async function queueSourceChange(
  db,
  schoolId,
  scope,
  operationId,
  now,
  owner,
) {
  if (!["core", "contacts", "deploy", "calendar"].includes(owner))
    throw new ApiError("SOURCE_OWNER_REQUIRED", 500);
  await statement(
    db,
    "INSERT OR IGNORE INTO source_changes(school_id,scope,operation_id,created_at,state) VALUES(?,?,?,?,'pending')",
    [schoolId, scope, operationId, now],
  ).run();
  return query(
    db,
    "SELECT * FROM source_pins WHERE school_id=? AND scope=? AND state='held' AND NOT(operation_id=? AND destination=?)",
    [schoolId, scope, operationId, owner],
  );
}
export async function requestSourceCancellations(env, pins) {
  const outcomes = await Promise.allSettled(
    pins
      .slice(0, 16)
      .map((pin) =>
        serviceCall(env, pin.destination, "/internal/operation-abort", {
          schoolId: env.SCHOOL_ID,
          owner: env.SERVICE_NAME,
          pinId: pin.pin_id,
          operationId: pin.operation_id,
        }),
      ),
  );
  return {
    attempted: outcomes.length,
    confirmed: outcomes.filter((x) => x.status === "fulfilled").length,
    remaining: Math.max(0, pins.length - outcomes.length),
  };
}
export function sourceChangeGuard(schoolId, scope, operationId, owner) {
  if (!["core", "contacts", "deploy", "calendar"].includes(owner))
    throw new ApiError("SOURCE_OWNER_REQUIRED", 500);
  return {
    sql: "SELECT NOT EXISTS(SELECT 1 FROM source_pins WHERE school_id=? AND scope=? AND state='held' AND NOT(operation_id=? AND destination=?)) AS ok",
    args: [schoolId, scope, operationId, owner],
  };
}
export function sourceChangeDone(schoolId, scope, operationId) {
  return {
    sql: "UPDATE source_changes SET state='committed' WHERE school_id=? AND scope=? AND operation_id=?",
    args: [schoolId, scope, operationId],
  };
}
export async function acquireSourcePin(env, input, revisionGuard, now) {
  const {
    schoolId,
    scope,
    pinId,
    destination,
    operationId,
    digest: intentDigest,
    fence,
    revision,
    validUntil,
    decisionId,
  } = input;
  if (
    schoolId !== env.SCHOOL_ID ||
    ![
      "core",
      "contacts",
      "deploy",
      "roster",
      "calendar",
      "lord",
      "venues",
      "layout",
    ].includes(destination) ||
    !Number.isSafeInteger(fence) ||
    fence < 1 ||
    !Number.isSafeInteger(validUntil) ||
    validUntil <= now ||
    typeof scope !== "string" ||
    scope.length > 160 ||
    typeof pinId !== "string"
  )
    throw new ApiError("MALFORMED_REQUEST", 400, "Invalid revision pin.");
  const decision = await inspectDecision(env, decisionId, {
    schoolId,
    operationId,
    service: destination,
    now,
  });
  const expectedDependency = decision.principal.dependencies?.find(
    (d) => d.owner === env.SERVICE_NAME && d.scope === scope,
  );
  if (
    (env.SERVICE_NAME === "core" && !expectedDependency) ||
    (expectedDependency &&
      String(expectedDependency.revision) !== String(revision))
  )
    throw new ApiError(
      "AUTHORITY_CHANGED",
      409,
      "Pin does not match the evaluated authority revision.",
    );
  if (!decision.descriptor.write || decision.principal.impersonating)
    throw new ApiError(
      "CAPABILITY_DENIED",
      403,
      "This decision cannot admit a mutation.",
    );
  // Destination has durably prepared exactly this intent/fence before any source holds it.
  const target = await serviceCall(
    env,
    destination,
    "/internal/operation-status",
    { schoolId, operationId },
  );
  if (
    !target ||
    (target.state !== "prepared" && target.state !== "pending") ||
    target.actorId !== decision.principal.actorId ||
    target.requestDigest !== decision.descriptor.bodyDigest ||
    target.authorityAction !== decision.descriptor.action ||
    target.fence !== fence ||
    target.digest !== intentDigest
  )
    throw new ApiError(
      "OPERATION_CONFLICT",
      409,
      "Destination operation is no longer prepared.",
    );
  const old = await one(
    env.DB,
    "SELECT * FROM source_pins WHERE school_id=? AND pin_id=?",
    [schoolId, pinId],
  );
  if (old) {
    if (
      old.digest !== intentDigest ||
      old.fence !== fence ||
      old.operation_id !== operationId ||
      old.scope !== scope ||
      old.destination !== destination ||
      old.revision !== String(revision) ||
      old.decision_id !== decisionId ||
      old.state !== "held"
    )
      throw new ApiError("PIN_CONFLICT", 409, "Revision pin cannot be reused.");
    return {
      pinId,
      owner: env.SERVICE_NAME,
      scope,
      revision,
      validUntil: old.valid_until,
    };
  }
  const checkId = crypto.randomUUID();
  const batch = [
    statement(
      env.DB,
      "INSERT INTO source_assertions(id,ok) VALUES(?,CASE WHEN (" +
        revisionGuard.sql +
        ") THEN 1 ELSE 0 END)",
      [checkId, ...(revisionGuard.args ?? [])],
    ),
    statement(
      env.DB,
      "INSERT INTO source_assertions(id,ok) SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM source_changes WHERE school_id=? AND scope=? AND state='pending' AND NOT(operation_id=? AND ?=?)) THEN 1 ELSE 0 END",
      [
        checkId + "-queue",
        schoolId,
        scope,
        operationId,
        destination,
        env.SERVICE_NAME,
      ],
    ),
    statement(
      env.DB,
      "INSERT INTO source_pins(school_id,scope,pin_id,destination,operation_id,digest,fence,revision,valid_until,decision_id,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'held',?)",
      [
        schoolId,
        scope,
        pinId,
        destination,
        operationId,
        intentDigest,
        fence,
        String(revision),
        Math.min(validUntil, decision.principal.validUntil),
        decisionId,
        now,
      ],
    ),
    statement(env.DB, "DELETE FROM source_assertions WHERE id IN(?,?)", [
      checkId,
      checkId + "-queue",
    ]),
  ];
  try {
    await env.DB.batch(batch);
  } catch {
    throw new ApiError(
      "AUTHORITY_CHANGED",
      409,
      "Source revision changed or an owner update is pending.",
      { retryable: true },
    );
  }
  return {
    pinId,
    owner: env.SERVICE_NAME,
    scope,
    revision,
    validUntil: Math.min(validUntil, decision.principal.validUntil),
  };
}
export async function releaseSourcePin(env, { schoolId, pinId }, now) {
  const pin = await one(
    env.DB,
    "SELECT * FROM source_pins WHERE school_id=? AND pin_id=?",
    [schoolId, pinId],
  );
  if (!pin)
    throw new ApiError("PIN_NOT_FOUND", 404, "Revision pin was not found.");
  if (pin.state === "released") return { pinId, state: "released" };
  const result = await serviceCall(
    env,
    pin.destination,
    "/internal/operation-status",
    { schoolId, operationId: pin.operation_id },
  );
  if (
    result.digest !== pin.digest ||
    !["committed", "aborted", "terminal-not-committed"].includes(result.state)
  )
    return { pinId, state: "held", reason: "DESTINATION_UNRESOLVED" };
  // A terminal outcome is permanent; the destination is responsible for fencing late writers.
  await statement(
    env.DB,
    "UPDATE source_pins SET state='released' WHERE school_id=? AND pin_id=? AND state='held'",
    [schoolId, pinId],
  ).run();
  return { pinId, state: "released", resolvedAt: now };
}
export async function admit(
  env,
  db,
  op,
  principal,
  dependencies = [],
  now = Date.now(),
) {
  if (
    !principal ||
    principal.impersonating ||
    principal.validUntil <= now ||
    principal.schoolId !== op.schoolId ||
    principal.actorId !== op.actorId
  )
    throw new ApiError(
      "AUTHORITY_CHANGED",
      409,
      "Current mutation authority is required.",
      { retryable: true },
    );
  if (op.state === "committed")
    return { state: "committed", receipt: op.receipt };
  const current = await operationStatus(db, op.schoolId, op.operationId);
  if (current?.state !== "prepared" || current.fence !== op.fence)
    throw new ApiError(
      "OPERATION_ABORTED",
      409,
      "Verify the original operation receipt.",
    );
  const stored = await one(
    db,
    "SELECT * FROM product_admissions WHERE school_id=? AND operation_id=?",
    [op.schoolId, op.operationId],
  );
  if (
    stored?.state === "ready" &&
    stored.fence === op.fence &&
    stored.digest === op.digest &&
    stored.valid_until > now
  )
    return {
      kind: "protected",
      decisionId: stored.decision_id,
      validUntil: stored.valid_until,
      pins: JSON.parse(stored.pins_json),
      fence: op.fence,
      digest: op.digest,
    };
  if (stored) {
    // Never overwrite a previous attempt's uncertain pin identities. Fence this exact
    // destination before reconciling every recorded acquisition, then require a new operation.
    await abortOperation(db, op, "PARTIAL_ADMISSION_RECOVERY", now);
    await resolveAdmission(
      env,
      db,
      op,
      { decisionId: stored.decision_id, pins: JSON.parse(stored.pins_json) },
      null,
      now,
    );
    throw new ApiError(
      "OPERATION_ABORTED",
      409,
      "The interrupted admission was fenced. Verify its receipt before a new operation.",
    );
  }

  const deps = [...(principal.dependencies ?? []), ...dependencies];
  const unique = new Map();
  for (const d of deps) {
    if (
      !["core", "contacts", "deploy", "calendar"].includes(d.owner) ||
      !d.scope ||
      d.revision === undefined
    )
      throw new ApiError(
        "DEPENDENCY_INVALID",
        503,
        "Admission dependency is incomplete.",
      );
    const key = d.owner + ":" + d.scope;
    const old = unique.get(key);
    if (old && String(old.revision) !== String(d.revision))
      throw new ApiError("AUTHORITY_CHANGED", 409, "Dependencies disagree.", {
        retryable: true,
      });
    unique.set(key, d);
  }
  const ordered = [...unique.values()].sort(
    (a, b) =>
      ["core", "contacts", "deploy", "calendar"].indexOf(a.owner) -
        ["core", "contacts", "deploy", "calendar"].indexOf(b.owner) ||
      a.scope.localeCompare(b.scope),
  );
  if (!ordered.some((d) => d.owner === "core"))
    throw new ApiError(
      "AUTHORITY_UNAVAILABLE",
      503,
      "Core authority admission is missing.",
    );
  let validUntil = Math.min(
      principal.validUntil,
      op.validUntil ?? principal.validUntil,
    ),
    pins = [];
  try {
    for (const d of ordered) {
      const current = await operationStatus(db, op.schoolId, op.operationId);
      if (current?.state !== "prepared" || current.fence !== op.fence)
        throw new ApiError("OPERATION_ABORTED", 409);
      validUntil = Math.min(validUntil, d.validUntil ?? validUntil);
      const pinId = await digest([
        op.schoolId,
        env.SERVICE_NAME,
        op.operationId,
        op.fence,
        d.owner,
        d.scope,
      ]);
      // Persist an acquisition identity before sending: a lost response remains recoverable.
      pins.push({ owner: d.owner, pinId, scope: d.scope, state: "uncertain" });
      const acquisition = await statement(
        db,
        "INSERT INTO product_admissions(school_id,operation_id,fence,digest,decision_id,valid_until,pins_json,state) VALUES(?,?,?,?,?,?,?,'acquiring') ON CONFLICT(school_id,operation_id) DO UPDATE SET pins_json=excluded.pins_json WHERE product_admissions.decision_id=excluded.decision_id AND product_admissions.state='acquiring'",
        [
          op.schoolId,
          op.operationId,
          op.fence,
          op.digest,
          principal.decisionId,
          validUntil,
          JSON.stringify(pins),
        ],
      ).run();
      if (acquisition.meta.changes !== 1)
        throw new ApiError(
          "OPERATION_CONFLICT",
          409,
          "Another acquisition owns this operation.",
        );
      const pin = await serviceCall(env, d.owner, "/internal/pins/acquire", {
        schoolId: op.schoolId,
        scope: d.scope,
        pinId,
        destination: env.SERVICE_NAME,
        operationId: op.operationId,
        digest: op.digest,
        fence: op.fence,
        revision: d.revision,
        validUntil,
        decisionId: principal.decisionId,
      });
      const stillPrepared = await operationStatus(
        db,
        op.schoolId,
        op.operationId,
      );
      if (
        stillPrepared?.state !== "prepared" ||
        stillPrepared.fence !== op.fence
      )
        throw new ApiError("OPERATION_ABORTED", 409);
      validUntil = Math.min(validUntil, pin.validUntil);
      pins[pins.length - 1] = { ...pin, state: "held" };
    }
    if (validUntil <= now)
      throw new ApiError(
        "AUTHORITY_CHANGED",
        409,
        "Authority expired during admission.",
      );
    const ready = await statement(
      db,
      "UPDATE product_admissions SET state='ready',pins_json=?,valid_until=? WHERE school_id=? AND operation_id=? AND fence=? AND digest=? AND state='acquiring' AND EXISTS(SELECT 1 FROM product_operations WHERE school_id=? AND operation_id=? AND fence=? AND state='prepared')",
      [
        JSON.stringify(pins),
        validUntil,
        op.schoolId,
        op.operationId,
        op.fence,
        op.digest,
        op.schoolId,
        op.operationId,
        op.fence,
      ],
    ).run();
    if (ready.meta.changes !== 1) throw new ApiError("OPERATION_ABORTED", 409);
    return {
      kind: "protected",
      decisionId: principal.decisionId,
      validUntil,
      pins,
      fence: op.fence,
      digest: op.digest,
    };
  } catch (error) {
    await abortOperation(db, op, "ADMISSION_FAILED", now);
    for (const pin of pins) {
      try {
        await serviceCall(env, pin.owner, "/internal/pins/release", {
          schoolId: op.schoolId,
          pinId: pin.pinId,
        });
      } catch {
        /* Durable acquisition identity is retained for recovery. */
      }
    }
    throw error;
  }
}
export async function resolveAdmission(
  env,
  db,
  op,
  admission,
  outcome,
  now = Date.now(),
) {
  const status = await operationStatus(db, op.schoolId, op.operationId);
  if (
    !["committed", "aborted", "terminal-not-committed"].includes(status?.state)
  )
    return { state: "pending" };
  const stored = await one(
    db,
    "SELECT * FROM product_admissions WHERE school_id=? AND operation_id=?",
    [op.schoolId, op.operationId],
  );
  const pins = stored ? JSON.parse(stored.pins_json) : (admission?.pins ?? []);
  let evidenceLinked = false;
  try {
    const linked = await serviceCall(
      env,
      "core",
      "/internal/evidence/receipt",
      {
        decisionId: stored?.decision_id ?? admission?.decisionId,
        destination: env.SERVICE_NAME,
        operationId: op.operationId,
      },
    );
    evidenceLinked = linked.recorded === true;
  } catch {
    /* The immutable destination receipt remains available for later reconciliation. */
  }
  const unresolved = [];
  for (const p of pins) {
    try {
      const r = await serviceCall(env, p.owner, "/internal/pins/release", {
        schoolId: op.schoolId,
        pinId: p.pinId,
      });
      if (r.state !== "released") unresolved.push(p);
    } catch {
      unresolved.push(p);
    }
  }
  await statement(
    db,
    "UPDATE product_admissions SET state=? WHERE school_id=? AND operation_id=?",
    [
      unresolved.length || !evidenceLinked ? "resolving" : "resolved",
      op.schoolId,
      op.operationId,
    ],
  ).run();
  return {
    state: unresolved.length || !evidenceLinked ? "pending" : "resolved",
    evidenceLinked,
    unresolved: unresolved.map((p) => p.pinId),
  };
}
