import { ApiError } from "../../runtime/errors.mjs";
import {
  one,
  query,
  statement,
  canonical,
  digest,
} from "../../runtime/store.mjs";
import { serviceCall } from "../../runtime/admission.mjs";
import { createContactsReader } from "../../contacts/accepted-facts.mjs";
const fail = (v, code = "CONTRIBUTION_UNVERIFIED", status = 403) => {
  if (!v)
    throw new ApiError(
      code,
      status,
      "The published contribution is not currently authorised.",
    );
};
export async function authorizeContribution(env, input, now) {
  fail(
    input.schoolId === env.SCHOOL_ID && typeof input.operationId === "string",
  );
  const proof = await serviceCall(
    env,
    "deploy",
    "/internal/publication/verify",
    { schoolId: env.SCHOOL_ID, ...input.source },
  );
  fail(proof.state === "committed");
  const match = proof.contributions?.find(
    (c) =>
      c.staffId === input.contribution.staffId &&
      c.field === input.contribution.field,
  );
  fail(match && (await digest(match)) === (await digest(input.contribution)));
  const original = await one(
    env.DB,
    "SELECT principal_json,descriptor_json FROM core_evidence WHERE school_id=? AND decision_id=?",
    [env.SCHOOL_ID, proof.decisionId],
  );
  fail(original);
  const old = JSON.parse(original.principal_json),
    d = JSON.parse(original.descriptor_json);
  fail(
    d.service === "deploy" &&
      d.action === "deploy.publish" &&
      !old.impersonating &&
      d.operationId === input.source.sourceOperationId,
  );
  const account = await one(
    env.DB,
    "SELECT * FROM core_accounts WHERE school_id=? AND account_id=?",
    [env.SCHOOL_ID, old.actorId],
  );
  fail(
    account &&
      !account.suspended &&
      !account.pending_change &&
      account.staff_id === old.actorStaffId,
    "AUTHORITY_CHANGED",
  );
  const grants = await query(
    env.DB,
    "SELECT * FROM core_grants WHERE school_id=? AND account_id=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?)",
    [env.SCHOOL_ID, old.actorId, now, now],
  );
  let observed = null,
    validated = null,
    validUntil = Math.min(
      now + 60000,
      ...grants.map((g) => g.valid_until ?? now + 60000),
    );
  if (!grants.some((g) => g.capability === "admin")) {
    fail(account.staff_id, "AUTHORITY_EVIDENCE_MISSING");
    fail(env.CONTACTS_AUTHORITY?.read, "DEPENDENCY_UNAVAILABLE", 503);
    const reader = createContactsReader({
      schoolId: env.SCHOOL_ID,
      clock: () => Math.max(now, Date.now()),
      readCurrent: async (q) => {
        observed = await env.CONTACTS_AUTHORITY.read(q);
        return observed.read;
      },
    });
    validated = await reader.readAcceptedFacts({
      schemaVersion: 1,
      schoolId: env.SCHOOL_ID,
      staffId: account.staff_id,
      profile: "authority",
      evaluationId: crypto.randomUUID(),
    });
    fail(validated.kind === "current", "AUTHORITY_UNAVAILABLE", 503);
    fail(
      observed.active &&
        ["smc", "eo", "schoolLeader"].every(
          (f) => validated.fields[f].record?.state === "accepted",
        ),
      "AUTHORITY_EVIDENCE_MISSING",
    );
    const yes = (k) =>
      validated.fields[k].state === "effective" &&
      validated.fields[k].record.value === true;
    fail(yes("smc") && (yes("eo") || yes("schoolLeader")), "CAPABILITY_DENIED");
    for (const r of Object.values(validated.fields))
      if (r.record)
        validUntil = Math.min(validUntil, r.record.validUntil ?? validUntil);
  }
  if (
    observed?.eligibility?.employmentActive?.validUntil !== null &&
    observed?.eligibility?.employmentActive?.validUntil !== undefined
  )
    validUntil = Math.min(
      validUntil,
      observed.eligibility.employmentActive.validUntil,
    );
  const intent = {
    operationId: input.operationId,
    staffId: match.staffId,
    changes: { [match.field]: match.proposedValue },
    fieldRevisions: { [match.field]: match.acceptedBaseFieldRevision },
    validFrom: match.validFrom ?? now,
    sourcePublicationId: input.source.publicationId,
    contributionId: input.contributionId,
  };
  fail(
    [
      "basicName",
      "role",
      "appointmentStatus",
      "employmentArrangement",
      "employmentTags",
      "subjectTags",
      "employmentActive",
      "memberships",
    ].includes(match.field),
  );
  const decisionId = crypto.randomUUID(),
    requestDigest = await digest(intent),
    dependencies = [
      {
        owner: "core",
        scope: `account:${old.actorId}`,
        revision: String(account.revision),
        validUntil,
      },
    ];
  if (observed)
    dependencies.push({
      owner: "contacts",
      scope: `staff:${account.staff_id}`,
      revision: String(observed.staffRevision),
      validUntil,
    });
  const principal = {
    schoolId: env.SCHOOL_ID,
    actorId: old.actorId,
    actorStaffId: account.staff_id,
    staffId: account.staff_id,
    subjectAccountId: old.actorId,
    sessionId: null,
    impersonating: false,
    capabilities: ["contacts.contribute"],
    fieldScope: { staffId: match.staffId, fields: [match.field] },
    action: "contacts.contribute",
    requestDigest,
    decisionId,
    validUntil,
    dependencies,
  };
  const descriptor = {
    service: "contacts",
    action: "contacts.contribute",
    write: true,
    operationId: input.operationId,
    resourceId: match.staffId,
    bodyDigest: requestDigest,
  };
  const evidence = {
    schemaVersion: 1,
    schoolId: env.SCHOOL_ID,
    decisionId,
    evaluatedAt: now,
    actor: {
      accountId: old.actorId,
      staffId: account.staff_id,
      linkageRevision: `link-${account.revision}`,
    },
    source: {
      ...input.source,
      originalDecisionId: proof.decisionId,
      contribution: match,
    },
    contacts: validated
      ? {
          kind: "observed",
          snapshot: validated.snapshot,
          contentDigest: validated.contentDigest,
          observation: validated.observation,
          eligibility: observed.eligibility,
        }
      : { kind: "contacts-not-required" },
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
        kind: "contribution-authority",
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
  return { principal, intent };
}
