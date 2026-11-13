import { ApiError } from "../../runtime/errors.mjs";
import { one, statement, digest, canonical } from "../../runtime/store.mjs";
export async function delegateDecision(env, input, now) {
  const row = await one(
    env.DB,
    "SELECT * FROM core_evidence WHERE school_id=? AND decision_id=?",
    [env.SCHOOL_ID, input.sourceDecisionId],
  );
  if (!row || row.valid_until <= now)
    throw new ApiError(
      "AUTHORITY_CHANGED",
      409,
      "The source decision expired.",
    );
  const original = JSON.parse(row.principal_json),
    source = JSON.parse(row.descriptor_json);
  const allowed =
    (input.destination === "contacts" &&
      (input.action === "contacts.provisional" ||
        (input.action === "contacts.mobile" && source.service === "roster")) &&
      ((source.service === "deploy" && source.action === "deploy.edit") ||
        (source.service === "roster" && source.action === "roster.write"))) ||
    (input.destination === "core" &&
      input.action === "core.calendar-grants" &&
      source.service === "calendar" &&
      source.action === "calendar.admin");
  if (
    !allowed ||
    source.operationId !== input.sourceOperationId ||
    original.impersonating
  )
    throw new ApiError(
      "SERVICE_DENIED",
      403,
      "The source action cannot delegate this operation.",
    );
  if (
    typeof input.operationId !== "string" ||
    !input.intent ||
    JSON.stringify(input.intent).length > 16384
  )
    throw new ApiError(
      "INVALID_INPUT",
      400,
      "The delegated operation is invalid.",
    );
  const account = await one(
    env.DB,
    "SELECT revision,suspended,staff_id FROM core_accounts WHERE school_id=? AND account_id=?",
    [env.SCHOOL_ID, original.actorId],
  );
  const dependency = original.dependencies.find(
    (d) => d.owner === "core" && d.scope === `account:${original.actorId}`,
  );
  if (
    !account ||
    account.suspended ||
    String(account.revision) !== String(dependency?.revision) ||
    account.staff_id !== original.actorStaffId
  )
    throw new ApiError("AUTHORITY_CHANGED", 409, "The source account changed.");
  const session = await one(
    env.DB,
    "SELECT revoked,expires_at FROM core_sessions WHERE school_id=? AND session_id=?",
    [env.SCHOOL_ID, original.sessionId],
  );
  if (!session || session.revoked || session.expires_at <= now)
    throw new ApiError("SESSION_EXPIRED", 401, "Sign in again.");
  const decisionId = crypto.randomUUID(),
    requestDigest = await digest(input.intent),
    validUntil = Math.min(row.valid_until, session.expires_at);
  const principal = {
    ...original,
    action: input.action,
    requestDigest,
    capabilities: [input.action],
    decisionId,
    validUntil,
    delegatedFrom: input.sourceDecisionId,
  };
  const descriptor = {
    service: input.destination,
    action: input.action,
    write: true,
    operationId: input.operationId,
    resourceId: input.resourceId ?? null,
    bodyDigest: requestDigest,
    sourceDecisionId: input.sourceDecisionId,
  };
  const evidence = {
    schemaVersion: 1,
    schoolId: env.SCHOOL_ID,
    decisionId,
    actor: { accountId: original.actorId, staffId: original.actorStaffId },
    evaluatedAt: now,
    delegation: {
      sourceDecisionId: input.sourceDecisionId,
      sourceAction: source.action,
      sourceOperationId: source.operationId,
      sourceService: source.service,
    },
    authorityEvidenceReference: input.sourceDecisionId,
    destination: {
      service: input.destination,
      operationId: input.operationId,
      receipt: "not-yet-committed",
    },
  };
  await statement(
    env.DB,
    "INSERT INTO core_evidence(school_id,decision_id,event_json,evidence_json,principal_json,descriptor_json,intent_digest,created_at,valid_until) VALUES(?,?,?,?,?,?,?,?,?)",
    [
      env.SCHOOL_ID,
      decisionId,
      canonical({
        schemaVersion: 2,
        eventId: decisionId,
        schoolId: env.SCHOOL_ID,
        kind: "delegated-decision",
        action: input.action,
        evaluatedAt: now,
      }),
      canonical(evidence),
      canonical(principal),
      canonical(descriptor),
      requestDigest,
      now,
      validUntil,
    ],
  ).run();
  return principal;
}
