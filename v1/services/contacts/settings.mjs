import { ApiError } from "../../runtime/errors.mjs";
import {
  canonical,
  query,
  one,
  prepareOperation,
  commitOperation,
  operationStatus,
  abortOperation,
} from "../../runtime/store.mjs";
import {
  admit,
  resolveAdmission,
  queueSourceChange,
  requestSourceCancellations,
  sourceChangeGuard,
  sourceChangeDone,
} from "../../runtime/admission.mjs";
import { deriveDisplay } from "./catalogues.mjs";
import { staffRecord, makeSnapshots, effectiveField } from "./store.mjs";
const subjects = [
    "Art",
    "CL",
    "TL",
    "ML",
    "SS",
    "Sci",
    "Music",
    "EL",
    "Math",
    "PHE",
  ],
  w = (sql, args) => ({ sql, args });
const fail = (v, c = "INVALID_INPUT", s = 400) => {
  if (!v) throw new ApiError(c, s, "Review this Contacts operation.");
};
export async function signatureSettings(env) {
  const row = await one(
    env.DB,
    "SELECT revision,body FROM contacts_settings WHERE school_id=? AND setting='signature'",
    [env.SCHOOL_ID],
  );
  return row
    ? { ...JSON.parse(row.body), revision: row.revision }
    : { subjects, revision: 0 };
}
export async function saveSignatureSettings(ctx) {
  const { env, body, principal, now } = ctx;
  fail(
    Array.isArray(body.subjects) &&
      body.subjects.length <= subjects.length &&
      new Set(body.subjects).size === body.subjects.length &&
      body.subjects.every((s) => subjects.includes(s)) &&
      Number.isSafeInteger(body.expectedRevision),
  );
  const op = await prepareOperation(env.DB, {
    schoolId: env.SCHOOL_ID,
    actorId: principal.actorId,
    operationId: body.operationId,
    action: "contacts.manage",
    intent: body,
    now,
    validUntil: principal.validUntil,
    authorization: principal,
  });
  if (op.receipt) return op.receipt.result;
  const admission = await admit(env, env.DB, op, principal, [], now),
    result = { subjects: body.subjects, revision: body.expectedRevision + 1 };
  const receipt = await commitOperation(env.DB, op, {
    now,
    admission,
    guards: [
      w(
        "SELECT COALESCE((SELECT revision FROM contacts_settings WHERE school_id=? AND setting='signature'),0)=? AS ok",
        [env.SCHOOL_ID, body.expectedRevision],
      ),
    ],
    writes: [
      w(
        "INSERT INTO contacts_settings(school_id,setting,revision,body) VALUES(?,'signature',?,?) ON CONFLICT(school_id,setting) DO UPDATE SET revision=excluded.revision,body=excluded.body",
        [
          env.SCHOOL_ID,
          result.revision,
          canonical({ subjects: body.subjects }),
        ],
      ),
    ],
    result,
    audit: { kind: "signature-settings", subjects: body.subjects },
  });
  await resolveAdmission(env, env.DB, op, admission, receipt, now);
  return result;
}
export async function recoveryStatus(ctx) {
  const rows = await query(
    ctx.env.DB,
    "SELECT operation_id,digest,state,action,created_at FROM product_operations WHERE school_id=? AND actor_id=? AND state IN('prepared','aborted') ORDER BY created_at DESC LIMIT 64",
    [ctx.env.SCHOOL_ID, ctx.principal.actorId],
  );
  return {
    cataloguePending: false,
    pending: rows.map((r) => ({
      requestId: r.operation_id,
      digest: r.digest,
      state: r.state,
      recoverable: true,
      message:
        r.state === "aborted"
          ? "This operation was durably aborted. Review its original draft before starting a new operation."
          : "Check the original receipt. If incomplete, recovery fences it before a new attempt.",
    })),
  };
}
export async function recoverSave(ctx) {
  const { env, body, principal, now } = ctx,
    operationId = body.operationId ?? body.requestId,
    op = await operationStatus(env.DB, env.SCHOOL_ID, operationId);
  fail(op, "NOT_FOUND", 404);
  fail(
    op.actorId === principal.actorId ||
      principal.capabilities.includes("admin"),
    "CAPABILITY_DENIED",
    403,
  );
  if (body.digest !== undefined)
    fail(body.digest === op.digest, "OPERATION_INTENT_CONFLICT", 409);
  // The original writer may commit between our read and the abort fence.
  // Only the receipt returned by that atomic race can settle this request.
  const receipt =
    op.state === "prepared"
      ? await abortOperation(env.DB, op, "OWNER_REQUESTED_SAVE_RECOVERY", now)
      : op.receipt;
  if (receipt?.state === "committed") {
    await resolveAdmission(env, env.DB, op, null, receipt, now);
    return {
      saved: true,
      state: "committed",
      receipt,
      mapping: receipt.result?.mapping,
    };
  }
  if (receipt?.state !== "terminal-not-committed")
    return { saved: false, state: "unknown", operationId };
  await resolveAdmission(env, env.DB, op, null, receipt, now);
  return {
    saved: false,
    state: "aborted",
    operationId,
    receipt,
    message:
      "The original operation is fenced and cannot commit late. Review the preserved draft and submit a new operation.",
  };
}
export async function recalculate(ctx) {
  const { env, body, principal, now } = ctx;
  const op = await prepareOperation(env.DB, {
    schoolId: env.SCHOOL_ID,
    actorId: principal.actorId,
    operationId: body.operationId,
    action: "contacts.manage",
    intent: body,
    now,
    validUntil: principal.validUntil,
    authorization: principal,
  });
  if (op.receipt) return op.receipt.result;
  const ids = await query(
    env.DB,
    "SELECT staff_id FROM contacts_staff WHERE school_id=? ORDER BY staff_id LIMIT 513",
    [env.SCHOOL_ID],
  );
  fail(ids.length <= 512, "DIRECTORY_BOUNDS", 413);
  const guards = [],
    writes = [];
  let count = 0;
  for (const { staff_id: staffId } of ids) {
    const old = await staffRecord(env.DB, env.SCHOOL_ID, staffId),
      fields = { ...old.fields },
      derived = await deriveDisplay(env.DB, env.SCHOOL_ID, fields, {
        schoolId: env.SCHOOL_ID,
        staffId,
        actorId: principal.actorId,
        operationId: op.operationId,
        now,
      });
    if (!derived.length) continue;
    const scope = `staff:${staffId}`;
    let pins = await queueSourceChange(
      env.DB,
      env.SCHOOL_ID,
      scope,
      op.operationId,
      now,
      "contacts",
    );
    if (pins.length) {
      await requestSourceCancellations(env, pins);
      pins = await queueSourceChange(
        env.DB,
        env.SCHOOL_ID,
        scope,
        op.operationId,
        now,
        "contacts",
      );
    }
    if (pins.length)
      return {
        state: "pending",
        operationId: op.operationId,
        reason: "SOURCE_PIN_HELD",
      };
    guards.push(
      sourceChangeGuard(env.SCHOOL_ID, scope, op.operationId, "contacts"),
      w(
        "SELECT EXISTS(SELECT 1 FROM contacts_staff WHERE school_id=? AND staff_id=? AND revision=?) AS ok",
        [env.SCHOOL_ID, staffId, old.staff.revision],
      ),
    );
    writes.push(
      ...derived,
      w(
        "UPDATE contacts_staff SET ttb_name=?,revision=revision+1 WHERE school_id=? AND staff_id=?",
        [effectiveField(fields.ttbName, now), env.SCHOOL_ID, staffId],
      ),
      ...(await makeSnapshots(
        env.DB,
        env.SCHOOL_ID,
        staffId,
        old.staff.revision + 1,
        fields,
      )),
      sourceChangeDone(env.SCHOOL_ID, scope, op.operationId),
    );
    count++;
  }
  if (count)
    writes.push(
      w(
        "INSERT INTO contacts_epoch(school_id,revision) VALUES(?,1) ON CONFLICT(school_id) DO UPDATE SET revision=revision+1",
        [env.SCHOOL_ID],
      ),
    );
  const admission = await admit(env, env.DB, op, principal, [], now),
    receipt = await commitOperation(env.DB, op, {
      now,
      admission,
      guards,
      writes,
      result: { recalculated: count },
      audit: { kind: "current-display-recalculation", count },
    });
  await resolveAdmission(env, env.DB, op, admission, receipt, now);
  return receipt.result;
}
