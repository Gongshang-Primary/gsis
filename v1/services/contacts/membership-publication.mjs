import { ApiError } from "../../runtime/errors.mjs";
import { canonical, digest, one, query, statement, operationStatus,
  prepareOperation, commitOperation, abortOperation } from "../../runtime/store.mjs";
import { serviceCall, resolveAdmission } from "../../runtime/admission.mjs";
import { isAuthorityPublication } from "./authority-publication.mjs";

const fail = (value, code = "MEMBERSHIP_PUBLICATION_INVALID", status = 409) => {
  if (!value) throw new ApiError(code, status, "The Memberships publication cannot be applied.");
};
export const isMembershipPublication = (value) =>
  (value?.field === "memberships" && value.membershipPublicationVersion === 1) || isAuthorityPublication(value);

/** This named projection is granted only to Contacts. Its revision is pinned
 * by the ordinary admission protocol before any field/frontier commit. */
export async function readMembershipFrontier(env) {
  fail(env.DEPLOY_CONTACTS?.read, "DEPENDENCY_UNAVAILABLE", 503);
  const value = await env.DEPLOY_CONTACTS.read({ schoolId: env.SCHOOL_ID, purpose: "memberships-order" });
  fail(value?.schoolId === env.SCHOOL_ID && Number.isSafeInteger(value.sequence) && value.sequence >= 0 &&
    typeof value.revision === "string" && (value.sequence > 0 ? typeof value.publicationId === "string" :
      value.revision === "absent" && value.publicationId === null), "PUBLICATION_UNVERIFIED", 503);
  return value;
}
export function membershipDependency(frontier, validUntil) {
  return { owner: "deploy", scope: "publication", revision: frontier.revision, validUntil };
}
export function membershipFrontierWrite(env, staffId, frontier, operationId, fieldRevision, publication = false) {
  return {
    sql: "INSERT INTO contacts_membership_frontiers(school_id,staff_id,publication_sequence,publication_id,source_kind,operation_id,field_revision) VALUES(?,?,?,?,?,?,?) ON CONFLICT(school_id,staff_id) DO UPDATE SET publication_sequence=excluded.publication_sequence,publication_id=excluded.publication_id,source_kind=excluded.source_kind,operation_id=excluded.operation_id,field_revision=excluded.field_revision",
    args: [env.SCHOOL_ID, staffId, frontier.sequence, frontier.publicationId, publication ? "publication" : "direct", operationId, fieldRevision],
  };
}
export function membershipFrontierGuard(env, staffId, sequence, publication = true) {
  return { sql: "SELECT COALESCE((SELECT publication_sequence FROM contacts_membership_frontiers WHERE school_id=? AND staff_id=?),-1)" + (publication ? "<" : "<=") + "? AS ok",
    args: [env.SCHOOL_ID, staffId, sequence] };
}
export async function assertMembershipPublicationCurrent(env, body, frontier) {
  fail(body.membershipPublicationVersion === 1 && Number.isSafeInteger(body.membershipPublicationSequence) &&
    body.membershipPublicationSequence > 0, "MEMBERSHIP_PUBLICATION_INVALID", 403);
  fail(frontier.sequence === body.membershipPublicationSequence && frontier.publicationId === body.sourcePublicationId,
    "MEMBERSHIP_PUBLICATION_SUPERSEDED");
  const prior = await one(env.DB, "SELECT publication_sequence FROM contacts_membership_frontiers WHERE school_id=? AND staff_id=?",
    [env.SCHOOL_ID, body.staffId]);
  fail(!prior || prior.publication_sequence < frontier.sequence, "MEMBERSHIP_PUBLICATION_SUPERSEDED");
}

async function supersede(env, row, source, reason, now) {
  const attempt = await operationAttempt(env, `membership-skip-${await digest(row.contribution_id)}`, now);
  const { operationId } = attempt;
  if (attempt.receipt?.state === "committed") return { state: "superseded", operationId };
  const op = await prepareOperation(env.DB, { schoolId: env.SCHOOL_ID, actorId: row.proposer,
    operationId, action: "internal.membership-superseded", intent: { contributionId: row.contribution_id, source }, now, validUntil: now + 60000 });
  if (op.receipt) return { state: op.receipt.state === "committed" ? "superseded" : "pending", operationId };
  const receipt = await commitOperation(env.DB, op, { now,
    admission: { kind: "system", reason: "verified immutable Memberships publication superseded by a durable ordering frontier" },
    guards: [{ sql: "SELECT EXISTS(SELECT 1 FROM contacts_contributions WHERE school_id=? AND contribution_id=? AND state IN('pending','conflicted')) AS ok", args: [env.SCHOOL_ID, row.contribution_id] }],
    writes: [{ sql: "UPDATE contacts_contributions SET state='superseded',outcome_json=? WHERE school_id=? AND contribution_id=?", args: [canonical({ operationId, reason }), env.SCHOOL_ID, row.contribution_id] }],
    result: { state: "superseded", contributionId: row.contribution_id, reason },
    audit: { source, contributionId: row.contribution_id, reason },
  });
  return { state: "superseded", operationId: receipt.operationId ?? operationId };
}

/** Only terminal, durably aborted attempts receive a new attempt identity.
 * A live/uncertain attempt is always inspected under its original identity. */
async function operationAttempt(env, prefix, now) {
  const attempts = await query(env.DB, "SELECT operation_id,state FROM product_operations WHERE school_id=? AND operation_id>=? AND operation_id<? ORDER BY operation_id LIMIT 129", [env.SCHOOL_ID, prefix + "-", prefix + "."]);
  fail(attempts.length < 128, "MEMBERSHIP_RETRY_LIMIT", 409);
  let index = 0;
  for (; index < 128; index++) {
    const operationId = `${prefix}-${index}`;
    const saved = attempts.find((a) => a.operation_id === operationId);
    if (!saved) return { operationId };
    if (saved.state === "aborted") continue;
    const op = await operationStatus(env.DB, env.SCHOOL_ID, operationId);
    if (op?.state === "committed") return { operationId, receipt: op.receipt };
    if (op?.state === "aborted") continue;
    if (op?.validUntil <= now) {
      const receipt = await abortOperation(env.DB, op, "MEMBERSHIP_ATTEMPT_EXPIRED", now);
      await resolveAdmission(env, env.DB, op, null, receipt, now);
      if (receipt?.state === "committed") return { operationId, receipt };
      continue;
    }
    return { operationId };
  }
  fail(false, "MEMBERSHIP_RETRY_LIMIT", 409);
}

async function applicationAttempt(env, contributionId, now) {
  return operationAttempt(env, `membership-apply-${await digest(contributionId)}`, now);
}
function appliedReceipt(operationId, receipt) {
  const result = receipt?.result;
  return { state: "applied", operationId,
    ...(result?.appliedFields ? { appliedFields: result.appliedFields, supersededFields: result.supersededFields } : {}) };
}

export async function processMembershipContribution(env, row, now = Date.now(), resumer = {}) {
  if (["applied", "superseded"].includes(row.state)) return { state: row.state, ...JSON.parse(row.outcome_json || "{}") };
  const source = JSON.parse(row.source_json), contribution = JSON.parse(row.proposal_json);
  fail(isMembershipPublication(contribution));
  const attempt = await applicationAttempt(env, row.contribution_id, now);
  if (attempt.receipt) return appliedReceipt(attempt.operationId, attempt.receipt);
  try {
    const { principal, intent } = await serviceCall(env, "core", "/internal/contribution-authority", {
      schoolId: env.SCHOOL_ID, source, contribution, contributionId: row.contribution_id, operationId: attempt.operationId,
      ...resumer,
    });
    const previous = await operationStatus(env.DB, env.SCHOOL_ID, attempt.operationId);
    if (resumer.resumerDecisionId && previous?.state === "prepared" && previous.actorId !== principal.actorId) {
      // Do not reinterpret an uncertain attempt under another identity. Abort
      // its durable fence first; a concurrently committed receipt wins instead.
      const receipt = await abortOperation(env.DB, previous, "AUTHORITY_RESUMER_CHANGED", Date.now());
      await resolveAdmission(env, env.DB, previous, null, receipt, Date.now());
      if (receipt?.state === "committed") return appliedReceipt(attempt.operationId, receipt);
      return processMembershipContribution(env, row, Date.now(), resumer);
    }
    const { handle } = await import("./service.mjs");
    const receipt = await handle({ env, path: `/staff/${row.staff_id}/update`, method: "POST", body: intent,
      principal, now: Math.max(now, Date.now()), internal: false });
    return receipt.state === "committed" ? appliedReceipt(attempt.operationId, receipt) :
      { state: "pending", operationId: attempt.operationId, code: receipt.reason ?? "MEMBERSHIP_PENDING" };
  } catch (error) {
    const op = await operationStatus(env.DB, env.SCHOOL_ID, attempt.operationId);
    if (op?.state === "committed") return appliedReceipt(attempt.operationId, op.receipt);
    if (error.code === "MEMBERSHIP_PUBLICATION_SUPERSEDED") {
      if (op?.state === "prepared") {
        const receipt = await abortOperation(env.DB, op, error.code, Date.now());
        await resolveAdmission(env, env.DB, op, null, receipt, Date.now());
        if (receipt?.state === "committed") return appliedReceipt(attempt.operationId, receipt);
      }
      return supersede(env, row, source, error.code, Date.now());
    }
    // Keep the original proposal and all unknown/failed attempts recoverable.
    return { state: "pending", operationId: attempt.operationId, code: error.code ?? "MEMBERSHIP_OUTCOME_UNKNOWN" };
  }
}

export async function applyMembershipPublication(ctx) {
  fail(ctx.body.schoolId === ctx.env.SCHOOL_ID, "SCHOOL_MISMATCH", 403);
  const row = await one(ctx.env.DB, "SELECT * FROM contacts_contributions WHERE school_id=? AND contribution_id=?",
    [ctx.env.SCHOOL_ID, ctx.body.contributionId]);
  fail(row && isMembershipPublication(JSON.parse(row.proposal_json)), "MEMBERSHIP_PUBLICATION_INVALID", 404);
  return processMembershipContribution(ctx.env, row, ctx.now, {
    ...(ctx.body.resumerDecisionId ? { resumerDecisionId: ctx.body.resumerDecisionId,
      resumerOperationId: ctx.body.resumerOperationId, resumerIntent: ctx.body.resumerIntent,
      versionId: ctx.body.versionId } : {}),
  });
}

/** Bounded internal progress, deliberately independent of provider schedulers. */
export async function membershipPublication(ctx) {
  const { env, body, now } = ctx;
  fail(body.schoolId === env.SCHOOL_ID, "SCHOOL_MISMATCH", 403);
  const offset = body.offset ?? 0, limit = body.limit ?? 4;
  fail(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(limit) && limit > 0 && limit <= 8,
    "MEMBERSHIP_BATCH_BOUNDS", 400);
  const source = { publicationId: body.publicationId, sourceOperationId: body.sourceOperationId,
    sourceDigest: body.sourceDigest, sourceFence: body.sourceFence };
  const proof = await serviceCall(env, "deploy", "/internal/publication/verify", {
    schoolId: env.SCHOOL_ID, ...source, membershipOnly: true, offset, limit,
  });
  fail(proof.state === "committed" && proof.membershipPublicationVersion === 1 && Array.isArray(proof.contributions), "PUBLICATION_UNVERIFIED");
  const original = await serviceCall(env, "core", "/internal/decision", { decisionId: proof.decisionId,
    schoolId: env.SCHOOL_ID, service: "deploy", actions: ["deploy.publish"], operationId: source.sourceOperationId, allowHistorical: true });
  const contributions = proof.contributions;
  fail(Number.isSafeInteger(proof.total) && proof.total >= 0 && proof.total <= 512 &&
    contributions.length <= limit && contributions.every(isMembershipPublication) &&
    (!contributions.some(isAuthorityPublication) || proof.authorityPublicationVersion === 1) &&
    new Set(contributions.map((c) => c.staffId)).size === contributions.length);
  const rows = [];
  for (const contribution of contributions) {
    const contributionId = `contribution-${await digest([source.publicationId, contribution.staffId, contribution.field])}`;
    await statement(env.DB,
      "INSERT OR IGNORE INTO contacts_contributions(school_id,contribution_id,staff_id,field,value_json,base_revision,source_publication,source_sequence,source_json,proposal_json,decision_id,proposer,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)",
      [env.SCHOOL_ID, contributionId, contribution.staffId, contribution.field, canonical(contribution.proposedValue),
        contribution.acceptedBaseFieldRevision ?? 0, source.publicationId, proof.sequence, canonical(source), canonical(contribution), proof.decisionId, original.principal.actorId, now]).run();
    const row = await one(env.DB, "SELECT * FROM contacts_contributions WHERE school_id=? AND contribution_id=?", [env.SCHOOL_ID, contributionId]);
    fail(row && row.proposal_json === canonical(contribution) && row.source_json === canonical(source), "OPERATION_INTENT_CONFLICT");
    rows.push(row);
  }
  // Distinct staff commits may proceed independently. Eight isolated owner
  // requests bound concurrency and keep each D1 admission within its budget.
  const results = await Promise.all(rows.map(async row => {
    if (["applied", "superseded"].includes(row.state))
      return { staffId: row.staff_id, state: row.state, ...JSON.parse(row.outcome_json || "{}") };
    try {
      return { staffId: row.staff_id, ...await serviceCall(env, "contacts", "/internal/membership-apply", {
        schoolId: env.SCHOOL_ID, contributionId: row.contribution_id,
        ...(body.resumerDecisionId ? { resumerDecisionId: body.resumerDecisionId,
          resumerOperationId: body.resumerOperationId, resumerIntent: body.resumerIntent,
          versionId: body.versionId } : {}),
      }) };
    } catch (error) {
      return { staffId: row.staff_id, state: "pending", code: error.code ?? "MEMBERSHIP_OUTCOME_UNKNOWN" };
    }
  }));
  const settled = await one(env.DB, "SELECT COUNT(*) total,COALESCE(SUM(state='applied'),0) applied,COALESCE(SUM(state='superseded'),0) superseded FROM contacts_contributions WHERE school_id=? AND source_publication=? AND field IN('memberships','authority') AND state IN('applied','superseded')", [env.SCHOOL_ID, source.publicationId]);
  const nextOffset = offset + results.length;
  return { publicationId: source.publicationId, state: settled.total === proof.total ? "applied" : "pending",
    offset, nextOffset: nextOffset < proof.total ? nextOffset : 0, total: proof.total, completed: settled.total,
    appliedCount: settled.applied, supersededCount: settled.superseded, results };
}
