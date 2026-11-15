import { ApiError } from "../../runtime/errors.mjs";
import {
  one,
  query,
  statement,
  canonical,
  digest,
  prepareOperation,
  commitOperation,
  operationStatus,
  abortOperation,
} from "../../runtime/store.mjs";
import {
  serviceCall,
  admit,
  resolveAdmission,
} from "../../runtime/admission.mjs";
import { validateValue, record } from "./store.mjs";
const fail = (v, code = "INVALID_INPUT", status = 400) => {
  if (!v)
    throw new ApiError(code, status, "Review this Contacts contribution.");
};
export async function processContribution(job, env) {
  const id = job.payload.contributionId,
    row = await one(
      env.DB,
      "SELECT * FROM contacts_contributions WHERE school_id=? AND contribution_id=?",
      [env.SCHOOL_ID, id],
    );
  if (!row || row.state !== "pending")
    return { state: "accepted", providerId: id };
  const source = JSON.parse(row.source_json),
    contribution = JSON.parse(row.proposal_json),
    operationId = `apply-${await digest(id)}`;
  try {
    validateValue(row.field, JSON.parse(row.value_json));
    const { principal, intent } = await serviceCall(
      env,
      "core",
      "/internal/contribution-authority",
      {
        schoolId: env.SCHOOL_ID,
        source,
        contribution,
        contributionId: id,
        operationId,
      },
    );
    const { handle } = await import("./service.mjs");
    const result = await handle({
      env,
      path: `/staff/${row.staff_id}/update`,
      method: "POST",
      body: intent,
      principal,
      now: Date.now(),
      internal: false,
    });
    if (result.state === "committed")
      return { state: "accepted", providerId: id };
    return {
      state: "failed",
      code: result.reason ?? "CONTRIBUTION_PENDING",
      retryable: true,
    };
  } catch (error) {
    if (error.status === 503)
      return { state: "failed", code: error.code, retryable: true };
    const original = await operationStatus(env.DB, env.SCHOOL_ID, operationId);
    if (original?.state === "prepared")
      await abortOperation(
        env.DB,
        original,
        error.code ?? "CONTRIBUTION_REFUSED",
        Date.now(),
      );
    if (original)
      await resolveAdmission(env, env.DB, original, null, null, Date.now());
    await statement(
      env.DB,
      "UPDATE contacts_contributions SET state='conflicted',outcome_json=? WHERE school_id=? AND contribution_id=? AND state='pending'",
      [
        canonical({
          code: error.code ?? "INVALID_PROPOSAL",
          checkedAt: Date.now(),
          message:
            "Review the current and proposed field values before acceptance.",
        }),
        env.SCHOOL_ID,
        id,
      ],
    ).run();
    return { state: "accepted", providerId: id };
  }
}
export async function listContributions(ctx) {
  const rows = await query(
    ctx.env.DB,
    "SELECT c.*,f.field AS current_field,f.revision AS current_revision,f.state AS current_state,f.value_json AS current_value_json,f.valid_from AS current_valid_from,f.valid_until AS current_valid_until,f.revoked AS current_revoked FROM contacts_contributions c LEFT JOIN contacts_fields f ON f.school_id=c.school_id AND f.staff_id=c.staff_id AND f.field=c.field WHERE c.school_id=? ORDER BY c.created_at DESC LIMIT 512",
    [ctx.env.SCHOOL_ID],
  );
  return {
    rows: rows.map((r) => {
      const current = r.current_field
        ? {
            ...record({
              field: r.current_field,
              revision: r.current_revision,
              state: r.current_state,
              value_json: r.current_value_json,
              valid_from: r.current_valid_from,
              valid_until: r.current_valid_until,
              revoked: r.current_revoked,
            }),
            revision: r.current_revision,
          }
        : null;
      const {
        current_field,
        current_revision,
        current_state,
        current_value_json,
        current_valid_from,
        current_valid_until,
        current_revoked,
        ...proposal
      } = r;
      return {
        ...proposal,
        value: JSON.parse(r.value_json),
        current: current
          ? { ...current, value_json: canonical(current.value ?? null) }
          : null,
        outcome: r.outcome_json ? JSON.parse(r.outcome_json) : null,
      };
    }),
  };
}
export async function resolveContribution(ctx) {
  const { env, body, principal, now } = ctx;
  fail(
    principal.capabilities.includes("contacts.manage") ||
      principal.capabilities.includes("admin"),
    "CAPABILITY_DENIED",
    403,
  );
  const row = await one(
    env.DB,
    "SELECT * FROM contacts_contributions WHERE school_id=? AND contribution_id=?",
    [env.SCHOOL_ID, body.contributionId],
  );
  fail(row, "NOT_FOUND", 404);
  fail(["accept", "reject", "correct"].includes(body.resolution));
  if (body.resolution === "reject") {
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
    if (op.receipt) return op.receipt;
    const admission = await admit(env, env.DB, op, principal, [], now);
    const receipt = await commitOperation(env.DB, op, {
      now,
      admission,
      guards: [
        {
          sql: "SELECT EXISTS(SELECT 1 FROM contacts_contributions WHERE school_id=? AND contribution_id=? AND state IN('pending','conflicted')) AS ok",
          args: [env.SCHOOL_ID, row.contribution_id],
        },
      ],
      writes: [
        {
          sql: "UPDATE contacts_contributions SET state='rejected',outcome_json=? WHERE school_id=? AND contribution_id=?",
          args: [
            canonical({
              accepter: principal.actorId,
              operationId: op.operationId,
              at: now,
            }),
            env.SCHOOL_ID,
            row.contribution_id,
          ],
        },
      ],
      result: { contributionId: row.contribution_id, state: "rejected" },
      audit: { kind: "contribution-rejection", proposer: row.proposer },
    });
    await resolveAdmission(env, env.DB, op, admission, receipt, now);
    return receipt;
  }
  const { handle } = await import("./service.mjs");
  return handle({
    ...ctx,
    path: `/staff/${row.staff_id}/update`,
    body: {
      operationId: body.operationId,
      staffId: row.staff_id,
      changes: {
        [row.field]:
          body.resolution === "correct"
            ? body.value
            : JSON.parse(row.value_json),
      },
      fieldRevisions: { [row.field]: body.revision },
      ...(body.validFrom !== undefined ? { validFrom: body.validFrom } : {}),
      contributionId: row.contribution_id,
    },
  });
}
