import { ApiError } from "../../runtime/errors.mjs";
import { one, statement, canonical } from "../../runtime/store.mjs";
import { serviceCall } from "../../runtime/admission.mjs";
const fail = (v, code = "SERVICE_DENIED", status = 403) => {
  if (!v)
    throw new ApiError(
      code,
      status,
      "The scoped Roster capability could not be verified.",
    );
};
/** Only named CoreRosterWebhook/CoreRosterExternal entrypoints call these functions. */
async function issue(env, input, kind, now) {
  fail(
    input.schoolId === env.SCHOOL_ID &&
      typeof input.operationId === "string" &&
      typeof input.bodyDigest === "string" &&
      /^[a-f0-9]{64}$/.test(input.bodyDigest),
  );
  const capability = kind === "external" ? "roster.external" : "roster.inbound";
  const grant = await one(
    env.DB,
    "SELECT * FROM core_service_grants WHERE school_id=? AND service='roster' AND capability=? AND enabled=1 AND valid_from<=? AND (valid_until IS NULL OR valid_until>?)",
    [env.SCHOOL_ID, capability, now, now],
  );
  fail(grant, "SERVICE_GRANT_REQUIRED");
  const scope = `service:roster:${capability}`;
  fail(
    !(await one(
      env.DB,
      "SELECT 1 AS pending FROM source_changes WHERE school_id=? AND scope=? AND state='pending'",
      [env.SCHOOL_ID, scope],
    )),
    "AUTHORITY_CHANGED",
    409,
  );
  let proof, contact;
  if (kind === "external") {
    proof = await serviceCall(env, "roster", "/internal/external-proof", {
      schoolId: env.SCHOOL_ID,
      tokenDigest: input.tokenDigest,
      operationId: input.operationId,
      commandDigest: input.bodyDigest,
    });
    fail(
      proof.verified === true &&
        proof.operationId === input.operationId &&
        proof.commandDigest === input.bodyDigest &&
        proof.expiresAt > now &&
        [
          "mutual",
          "duties",
          "peer.respond",
          "duty.acknowledge",
          "duties.read",
        ].includes(proof.purpose),
    );
    fail(env.CONTACTS_RECIPIENTS?.staff, "CONTACTS_BINDING_REQUIRED", 503);
    contact = await env.CONTACTS_RECIPIENTS.staff({
      schoolId: env.SCHOOL_ID,
      staffId: proof.staffId,
    });
    fail(
      contact?.staffId === proof.staffId &&
        (contact.active === true || proof.dateActive === true),
      "RECIPIENT_UNAVAILABLE",
    );
  } else {
    proof = await serviceCall(env, "roster", "/internal/webhook-proof", {
      schoolId: env.SCHOOL_ID,
      eventId: input.eventId,
      operationId: input.operationId,
      commandDigest: input.bodyDigest,
    });
    fail(
      proof.verified === true &&
        proof.provider === "whatsapp" &&
        proof.action === "roster.inbound" &&
        proof.operationId === input.operationId &&
        proof.bodyDigest === input.bodyDigest &&
        typeof proof.senderMobile === "string",
    );
    fail(
      env.CONTACTS_RECIPIENTS?.lookupMobile,
      "CONTACTS_BINDING_REQUIRED",
      503,
    );
    contact = await env.CONTACTS_RECIPIENTS.lookupMobile({
      schoolId: env.SCHOOL_ID,
      mobile: proof.senderMobile,
    });
    fail(
      contact?.state === "unique" &&
        contact.active === true &&
        (!proof.intendedStaffId || proof.intendedStaffId === contact.staffId),
      "RECIPIENT_UNMATCHED",
    );
  }
  const decisionId = crypto.randomUUID(),
    validUntil = Math.min(
      now + 60000,
      grant.valid_until ?? now + 60000,
      proof.expiresAt ?? now + 60000,
      contact.validUntil ?? now + 60000,
    );
  const principal = {
    schoolId: env.SCHOOL_ID,
    actorId: `service-roster-${kind}`,
    actorStaffId: null,
    staffId: contact.staffId,
    subjectStaffId: contact.staffId,
    subjectAccountId: null,
    sessionId: null,
    impersonating: false,
    capabilities: ["roster.own"],
    action: "roster.own",
    requestDigest: input.bodyDigest,
    decisionId,
    validUntil,
    serviceIdentity: `roster-${kind}`,
    fieldScope: {
      purpose: proof.purpose ?? "roster.inbound",
      resourceId: proof.resourceId ?? proof.resource ?? input.eventId,
    },
    revisions: {
      core: `service-roster-${grant.revision}`,
      contacts: String(contact.revision),
    },
    dependencies: [
      { owner: "core", scope, revision: String(grant.revision), validUntil },
      {
        owner: "contacts",
        scope: `staff:${contact.staffId}`,
        revision: String(contact.revision),
        validUntil,
      },
    ],
  };
  const descriptor = {
    service: "roster",
    action: "roster.own",
    write: kind !== "external" || proof.write !== false,
    operationId: input.operationId,
    resourceId: principal.fieldScope.resourceId,
    bodyDigest: input.bodyDigest,
  };
  const evidence = {
    schemaVersion: 1,
    schoolId: env.SCHOOL_ID,
    decisionId,
    evaluatedAt: now,
    actor: {
      kind: "service",
      service: `roster-${kind}`,
      grantRevision: grant.revision,
    },
    subject: { staffId: contact.staffId },
    scope: principal.fieldScope,
    ownerProof: {
      eventId: proof.eventId ?? input.eventId ?? null,
      tokenDigest: input.tokenDigest ?? null,
      sourceRevision: proof.sourceRevision ?? null,
      expiresAt: proof.expiresAt ?? null,
    },
    contacts: {
      kind: "purpose-observation",
      staffRevision: contact.revision,
      observation: contact.observation,
      fieldRevisions: contact.fieldRevisions,
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
        kind: "scoped-roster-capability",
        action: "roster.own",
        evaluatedAt: now,
      }),
      canonical(evidence),
      canonical(principal),
      canonical(descriptor),
      input.bodyDigest,
      now,
      validUntil,
    ],
  ).run();
  return principal;
}
export function authorizeRosterWebhook(env, input, now = Date.now()) {
  return issue(env, input, "webhook", now);
}
export function authorizeRosterExternal(env, input, now = Date.now()) {
  return issue(env, input, "external", now);
}
