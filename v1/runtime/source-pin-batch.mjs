/** Contacts staff pins remain individual. Only transport/owner-local SQL is batched. */
import { ApiError, identifier, requireValue } from "./errors.mjs";
import { canonical, digest, statement } from "./store.mjs";
import { inspectDecision, serviceCall } from "./admission.mjs";
const destinations = [
  "core",
  "contacts",
  "deploy",
  "roster",
  "calendar",
  "lord",
  "venues",
  "layout",
];
async function validate(env, input, now, acquire) {
  requireValue(
    env.SERVICE_NAME === "contacts" && input.schoolId === env.SCHOOL_ID,
    "SCHOOL_MISMATCH",
    403,
  );
  for (const key of ["schoolId", "destination", "operationId", "decisionId"])
    identifier(input[key], key);
  requireValue(
    destinations.includes(input.destination) &&
      Number.isSafeInteger(input.fence) &&
      input.fence > 0 &&
      /^[a-f0-9]{64}$/.test(input.digest),
    "MALFORMED_REQUEST",
  );
  requireValue(
    Array.isArray(input.pins) &&
      input.pins.length > 0 &&
      input.pins.length <= 512,
    "PIN_BATCH_BOUNDS",
    413,
  );
  const seen = new Set(),
    rows = [];
  for (const pin of input.pins) {
    requireValue(
      typeof pin.scope === "string" && pin.scope.startsWith("staff:"),
      "MALFORMED_REQUEST",
    );
    identifier(pin.scope.slice(6), "staffId");
    requireValue(
      typeof pin.revision === "string" &&
        /^\d{1,16}$/.test(pin.revision) &&
        Number.isSafeInteger(Number(pin.revision)) &&
        Number(pin.revision) > 0 &&
        Number.isSafeInteger(pin.validUntil) &&
        pin.validUntil > 0,
      "MALFORMED_REQUEST",
    );
    requireValue(!seen.has(pin.scope), "PIN_CONFLICT", 409);
    seen.add(pin.scope);
    requireValue(
      pin.pinId ===
        (await digest([
          input.schoolId,
          input.destination,
          input.operationId,
          input.fence,
          "contacts",
          pin.scope,
        ])),
      "PIN_CONFLICT",
      409,
    );
    if (acquire) requireValue(pin.validUntil > now, "AUTHORITY_CHANGED", 409);
    rows.push([pin.pinId, pin.scope, pin.revision, pin.validUntil]);
  }
  return rows;
}
function bindingMismatch(input, json, heldOnly) {
  return {
    sql: `NOT EXISTS(SELECT 1 FROM json_each(?) j JOIN source_pins p ON p.school_id=? AND p.pin_id=json_extract(j.value,'$[0]') WHERE p.scope<>json_extract(j.value,'$[1]') OR p.revision<>json_extract(j.value,'$[2]') OR p.destination<>? OR p.operation_id<>? OR p.digest<>? OR p.fence<>? OR p.decision_id<>?${heldOnly ? " OR p.state<>'held' OR p.valid_until<>json_extract(j.value,'$[3]')" : ""})`,
    args: [
      json,
      input.schoolId,
      input.destination,
      input.operationId,
      input.digest,
      input.fence,
      input.decisionId,
    ],
  };
}
function insertPins(env, input, json, state, now) {
  return statement(
    env.DB,
    `INSERT INTO source_pins(school_id,scope,pin_id,destination,operation_id,digest,fence,revision,valid_until,decision_id,state,created_at) SELECT ?,json_extract(value,'$[1]'),json_extract(value,'$[0]'),?,?,?,?,json_extract(value,'$[2]'),json_extract(value,'$[3]'),?,?,? FROM json_each(?) WHERE 1 ON CONFLICT(school_id,pin_id) DO ${state === "released" ? "UPDATE SET state='released'" : "NOTHING"}`,
    [
      input.schoolId,
      input.destination,
      input.operationId,
      input.digest,
      input.fence,
      input.decisionId,
      state,
      now,
      json,
    ],
  );
}
export async function acquireContactsPins(env, input, now = Date.now()) {
  const rows = await validate(env, input, now, true);
  const decision = await inspectDecision(env, input.decisionId, {
    schoolId: input.schoolId,
    operationId: input.operationId,
    service: input.destination,
    now,
  });
  const p = decision.principal,
    d = decision.descriptor;
  requireValue(
    p.schoolId === input.schoolId &&
      !p.impersonating &&
      p.validUntil > now &&
      d.write,
    "CAPABILITY_DENIED",
    403,
  );
  for (const row of rows) {
    const expected = p.dependencies?.find(
      (x) => x.owner === "contacts" && x.scope === row[1],
    );
    requireValue(
      !expected || String(expected.revision) === row[2],
      "AUTHORITY_CHANGED",
      409,
    );
    row[3] = Math.min(row[3], p.validUntil);
  }
  const target = await serviceCall(
    env,
    input.destination,
    "/internal/operation-status",
    { schoolId: input.schoolId, operationId: input.operationId },
  );
  requireValue(
    target &&
      ["prepared", "pending"].includes(target.state) &&
      target.actorId === p.actorId &&
      target.requestDigest === d.bodyDigest &&
      target.authorityAction === d.action &&
      target.fence === input.fence &&
      target.digest === input.digest,
    "OPERATION_CONFLICT",
    409,
  );
  const json = canonical(rows),
    same = bindingMismatch(input, json, true),
    key = crypto.randomUUID();
  // Revision, queued changes, compatibility and expiry are checked in the same
  // transaction as inserts. Released tombstones reject a delayed acquisition.
  const sql = `${same.sql} AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN contacts_staff s ON s.school_id=? AND s.staff_id=substr(json_extract(j.value,'$[1]'),7) WHERE s.staff_id IS NULL OR CAST(s.revision AS TEXT)<>json_extract(j.value,'$[2]') OR json_extract(j.value,'$[3]')<=MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))) AND NOT EXISTS(SELECT 1 FROM source_changes c JOIN json_each(?) j ON c.scope=json_extract(j.value,'$[1]') WHERE c.school_id=? AND c.state='pending' AND NOT(c.operation_id=? AND ?='contacts'))`;
  try {
    await env.DB.batch([
      statement(
        env.DB,
        `INSERT INTO source_assertions(id,ok) SELECT ?,CASE WHEN ${sql} THEN 1 ELSE 0 END`,
        [
          key,
          ...same.args,
          json,
          input.schoolId,
          now,
          json,
          input.schoolId,
          input.operationId,
          input.destination,
        ],
      ),
      insertPins(env, input, json, "held", now),
      statement(env.DB, "DELETE FROM source_assertions WHERE id=?", [key]),
    ]);
  } catch {
    throw new ApiError(
      "AUTHORITY_CHANGED",
      409,
      "A staff revision changed, a source update is pending, or this acquisition was fenced.",
    );
  }
  return {
    pins: rows.map((row) => ({
      pinId: row[0],
      owner: "contacts",
      scope: row[1],
      revision: row[2],
      validUntil: row[3],
    })),
  };
}
export async function releaseContactsPins(env, input, now = Date.now()) {
  const rows = await validate(env, input, now, false);
  const target = await serviceCall(
    env,
    input.destination,
    "/internal/operation-status",
    { schoolId: input.schoolId, operationId: input.operationId },
  );
  requireValue(
    target && target.digest === input.digest,
    "OPERATION_CONFLICT",
    409,
  );
  const terminal =
    (target.state === "committed" && target.fence === input.fence) ||
    (["aborted", "terminal-not-committed"].includes(target.state) &&
      target.fence > input.fence);
  if (!terminal)
    return {
      state: "held",
      pins: rows.map((row) => ({ pinId: row[0], state: "held" })),
    };
  const json = canonical(rows),
    same = bindingMismatch(input, json, false),
    key = crypto.randomUUID();
  // A missing acquisition may still be in flight. Keep its exact identity as a
  // released tombstone; never use wall-clock expiry to discard a held pin.
  try {
    await env.DB.batch([
      statement(
        env.DB,
        `INSERT INTO source_assertions(id,ok) SELECT ?,CASE WHEN ${same.sql} THEN 1 ELSE 0 END`,
        [key, ...same.args],
      ),
      insertPins(env, input, json, "released", now),
      statement(env.DB, "DELETE FROM source_assertions WHERE id=?", [key]),
    ]);
  } catch {
    throw new ApiError(
      "PIN_CONFLICT",
      409,
      "The release does not match the original source pin binding.",
    );
  }
  return {
    state: "released",
    pins: rows.map((row) => ({ pinId: row[0], state: "released" })),
  };
}
