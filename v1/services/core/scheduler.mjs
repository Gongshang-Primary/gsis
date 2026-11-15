import { ApiError } from "../../runtime/errors.mjs";
import { one, query, statement, canonical } from "../../runtime/store.mjs";
/** Called only by the RosterScheduler named WorkerEntrypoint binding, never an HTTP route. */
export async function authorizeRosterSchedule(env, input, now = Date.now()) {
  if (
    input.schoolId !== env.SCHOOL_ID ||
    ![
      "roster.allocate",
      "roster.publish",
      "roster.notify",
      "roster.export",
    ].includes(input.action) ||
    typeof input.operationId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(input.operationId) ||
    typeof input.bodyDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.bodyDigest)
  )
    throw new ApiError(
      "SERVICE_DENIED",
      403,
      "Scheduled action is not within this binding.",
    );
  const grant = await one(
    env.DB,
    "SELECT * FROM core_service_grants WHERE school_id=? AND service='roster' AND capability=? AND enabled=1 AND valid_from<=? AND (valid_until IS NULL OR valid_until>?)",
    [env.SCHOOL_ID, input.action, now, now],
  );
  if (!grant)
    throw new ApiError(
      "SERVICE_GRANT_REQUIRED",
      403,
      "An administrator must enable this scheduler action.",
    );
  const pending = await one(
    env.DB,
    "SELECT 1 AS pending FROM source_changes WHERE school_id=? AND scope=? AND state='pending'",
    [env.SCHOOL_ID, `service:roster:${input.action}`],
  );
  if (pending)
    throw new ApiError(
      "AUTHORITY_CHANGED",
      409,
      "Scheduler permission change is pending.",
    );
  const decisionId = crypto.randomUUID(),
    validUntil = Math.min(grant.valid_until ?? now + 60000, now + 60000);
  const principal = {
    schoolId: env.SCHOOL_ID,
    actorId: "service-roster",
    staffId: null,
    actorStaffId: null,
    subjectAccountId: null,
    sessionId: null,
    impersonating: false,
    capabilities: [
      input.action,
      ...(["roster.notify", "roster.export"].includes(input.action)
        ? ["roster.read"]
        : []),
    ],
    decisionId,
    validUntil,
    action: input.action,
    requestDigest: input.bodyDigest,
    serviceIdentity: "roster",
    revisions: { core: `service-roster-${grant.revision}` },
    dependencies: [
      {
        owner: "core",
        scope: `service:roster:${input.action}`,
        revision: String(grant.revision),
        validUntil,
      },
    ],
  };
  const descriptor = {
    service: "roster",
    action: input.action,
    write: true,
    operationId: input.operationId,
    resourceId: input.resourceId ?? null,
    bodyDigest: input.bodyDigest,
  };
  const event = {
    schemaVersion: 2,
    eventId: decisionId,
    kind: "privileged-decision",
    schoolId: env.SCHOOL_ID,
    actorService: "roster",
    action: input.action,
    outcome: "allow",
    evaluatedAt: now,
  };
  const evidence = {
    schemaVersion: 1,
    schoolId: env.SCHOOL_ID,
    decisionId,
    evaluatedAt: now,
    actor: {
      kind: "service",
      service: "roster",
      binding: "RosterScheduler",
      grantRevision: grant.revision,
    },
    contacts: { kind: "contacts-not-required" },
    destination: {
      service: "roster",
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
      canonical(event),
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
