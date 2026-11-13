import { authorizeContribution } from "./contributions.mjs";
import { ApiError } from "../../runtime/errors.mjs";
import {
  canonical,
  digest,
  query,
  one,
  statement,
  prepareOperation,
  commitOperation,
  operationStatus,
} from "../../runtime/store.mjs";
import {
  requireMembership,
  serviceCall,
  secureEqual,
  admit,
  resolveAdmission,
  acquireSourcePin,
  releaseSourcePin,
  queueSourceChange,
  requestSourceCancellations,
  sourceChangeGuard,
  sourceChangeDone,
} from "../../runtime/admission.mjs";
import { createSessionPolicy } from "../../core/session-policy.mjs";
import { createAuthority } from "../../core/authority.mjs";
import { createCoreProvider } from "../../contacts/core-provider.mjs";
import { createContactsReader } from "../../contacts/accepted-facts.mjs";
import { createSecurityAudit } from "../../core/audit.mjs";
import { delegateDecision } from "./delegation.mjs";
import { verifyIdentity } from "./identity.mjs";
const DURATION = 864000000;
const ACTIONS = [
  "core.session",
  "core.admin",
  "contacts.read",
  "contacts.manage",
  "contacts.self",
  "contacts.powerUser",
  "deploy.read",
  "deploy.edit",
  "deploy.publish",
  "roster.read",
  "roster.own",
  "roster.write",
  "roster.admin",
  "roster.publish",
  "roster.allocate",
  "calendar.read",
  "calendar.edit",
  "calendar.parent.edit",
  "calendar.admin",
  "venues.read",
  "venues.book",
  "venues.manage",
  "venues.admin",
  "venues.source",
  "layout.read",
  "layout.edit",
  "layout.admin",
  "lord.read",
  "lord.borrow",
  "lord.admin",
  "lord.signage",
];
const validId = (v) =>
  typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(v);
const fail = (
  condition,
  code = "MALFORMED_REQUEST",
  status = 400,
  message = "Check the supplied values.",
) => {
  if (!condition) throw new ApiError(code, status, message);
};
function cookie(request, name) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
}
function origin(env, value) {
  fail(
    typeof env.PUBLIC_ORIGIN === "string" && value === env.PUBLIC_ORIGIN,
    "ORIGIN_DENIED",
    403,
    "This request must come from the school application.",
  );
}
const interval = (value, from = 0, until = null) => ({
  value,
  validFrom: from,
  validUntil: until,
  revoked: false,
});
function sessionEvidence(s, a) {
  return {
    schemaVersion: 1,
    schoolId: s.school_id,
    sessionId: s.session_id,
    accountId: s.account_id,
    issuer: a.issuer,
    subject: a.subject,
    authenticatedAt: s.authenticated_at,
    expiresAt: s.expires_at,
    revoked: !!s.revoked,
  };
}
async function readAccount(env, token, now) {
  const s = await one(
    env.DB,
    "SELECT * FROM core_sessions WHERE school_id=? AND token_hash=?",
    [env.SCHOOL_ID, await digest(token)],
  );
  fail(s, "SESSION_INVALID", 401, "Sign in to continue.");
  const a = await one(
    env.DB,
    "SELECT * FROM core_accounts WHERE school_id=? AND account_id=?",
    [env.SCHOOL_ID, s.account_id],
  );
  fail(a, "IDENTITY_INVALID", 401, "Account linkage is unavailable.");
  const validation = createSessionPolicy({ clock: () => now }).validateSession(
    sessionEvidence(s, a),
    {
      schoolId: a.school_id,
      accountId: a.account_id,
      issuer: a.issuer,
      subject: a.subject,
      identityVerified: true,
      suspended: !!a.suspended,
    },
  );
  fail(
    validation.outcome === "allow",
    validation.reasonCode,
    validation.reasonCode === "ACCOUNT_SUSPENDED" ? 403 : 401,
    "Sign in again or contact your administrator.",
  );
  fail(
    !a.pending_change,
    "AUTHORITY_CHANGED",
    409,
    "An account change is pending.",
  );
  const grants = await query(
    env.DB,
    "SELECT * FROM core_grants WHERE school_id=? AND account_id=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?)",
    [env.SCHOOL_ID, a.account_id, now, now],
  );
  return { s, a, grants };
}
function accountEvidence(a, grants) {
  const g = grants.find((g) => g.capability === "admin");
  return {
    schoolId: a.school_id,
    accountId: a.account_id,
    issuer: a.issuer,
    subject: a.subject,
    identityVerified: true,
    identityUnique: true,
    suspended: !!a.suspended,
    linkage: a.staff_id ? "unique" : "none",
    linkageRevision: `link-${a.revision}`,
    staffId: a.staff_id,
    globalAdmin: g
      ? interval(true, g.valid_from, g.valid_until)
      : interval(false),
  };
}
export async function authorizeCore(env, input, now = Date.now()) {
  fail(
    input.schoolId === env.SCHOOL_ID,
    "SCHOOL_MISMATCH",
    403,
    "School does not match.",
  );
  const d = input.descriptor
    ? Object.fromEntries(
        Object.entries(input.descriptor).filter(([, v]) => v !== undefined),
      )
    : null;
  fail(
    d &&
      ACTIONS.includes(d.action) &&
      typeof d.write === "boolean" &&
      [
        "core",
        "contacts",
        "deploy",
        "roster",
        "calendar",
        "lord",
        "venues",
        "layout",
      ].includes(d.service),
    "CAPABILITY_DENIED",
    403,
    "Unknown operation.",
  );
  const { s, a, grants } = await readAccount(env, input.sessionToken, now);
  if (d.write) {
    origin(env, input.origin);
    fail(
      await secureEqual(input.csrfToken, s.csrf_token),
      "CSRF_DENIED",
      403,
      "Reload the page before saving.",
    );
    fail(
      validId(d.operationId),
      "MALFORMED_REQUEST",
      400,
      "A stable operation ID is required.",
    );
  }
  const admin = grants.some((g) => g.capability === "admin");
  let target = a,
    targetGrants = grants,
    impersonating = false;
  if (input.previewAccountId) {
    fail(
      admin && !d.write,
      "IMPERSONATION_DENIED",
      403,
      "Preview is read-only.",
    );
    target = await one(
      env.DB,
      "SELECT * FROM core_accounts WHERE school_id=? AND account_id=?",
      [env.SCHOOL_ID, input.previewAccountId],
    );
    fail(
      target && !target.suspended,
      "IMPERSONATION_DENIED",
      403,
      "Preview account is unavailable.",
    );
    targetGrants = await query(
      env.DB,
      "SELECT * FROM core_grants WHERE school_id=? AND account_id=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?)",
      [env.SCHOOL_ID, target.account_id, now, now],
    );
    impersonating = true;
  }
  const targetAdmin = targetGrants.some((g) => g.capability === "admin");
  const caps = new Set(["core.session"]);
  for (const g of targetGrants)
    if (g.capability === "admin")
      for (const action of ACTIONS) caps.add(action);
    else caps.add(g.capability);
  if (targetAdmin) caps.add("admin");
  if (target.staff_id) {
    caps.add("contacts.read");
    caps.add("contacts.self");
    caps.add("roster.own");
  }
  if (caps.has("contacts.powerUser")) caps.add("contacts.manage");
  if (caps.has("calendar.admin"))
    for (const x of ["calendar.edit", "calendar.parent.edit", "calendar.read"])
      caps.add(x);
  if (caps.has("calendar.parent.edit")) caps.add("calendar.read");
  if (caps.has("lord.admin"))
    for (const x of ["lord.read", "lord.borrow"]) caps.add(x);
  if (caps.has("lord.borrow")) caps.add("lord.read");
  if (caps.has("layout.admin"))
    for (const x of ["layout.read", "layout.edit"]) caps.add(x);
  if (caps.has("layout.edit")) caps.add("layout.read");
  if (caps.has("venues.admin"))
    for (const x of ["venues.read", "venues.book", "venues.manage"])
      caps.add(x);
  if (caps.has("roster.admin"))
    for (const x of [
      "roster.read",
      "roster.write",
      "roster.publish",
      "roster.allocate",
    ])
      caps.add(x);
  let observation = null,
    authority = null;
  const derived =
    !targetAdmin &&
    [
      "deploy.read",
      "deploy.edit",
      "deploy.publish",
      "roster.read",
      "roster.write",
      "roster.publish",
      "roster.allocate",
    ].includes(d.action);
  if (derived) {
    fail(
      target.staff_id,
      "IDENTITY_UNLINKED",
      401,
      "An administrator must link your staff identity.",
    );
    const evaluationId = crypto.randomUUID();
    const reader = createContactsReader({
      schoolId: env.SCHOOL_ID,
      clock: () => Math.max(now, Date.now()),
      readCurrent: async (q) => {
        // This Core-only query still proves the user session; common secret alone is insufficient.
        const r = await serviceCall(env, "contacts", "/internal/authority", {
          query: q,
          sessionToken: input.sessionToken,
        });
        observation = r;
        return r.read;
      },
    });
    const q = {
      schemaVersion: 1,
      schoolId: env.SCHOOL_ID,
      staffId: target.staff_id,
      profile: "authority",
      evaluationId,
    };
    const read = await reader.readAcceptedFacts(q);
    fail(
      read.kind === "current",
      read.code === "STALE_EVIDENCE"
        ? "AUTHORITY_CHANGED"
        : "AUTHORITY_UNAVAILABLE",
      read.code === "STALE_EVIDENCE" ? 409 : 503,
      "Contacts authority could not be verified.",
    );
    observation.validated = read;
    fail(
      observation.active === true,
      "AUTHORITY_EVIDENCE_MISSING",
      403,
      "Required authority records are incomplete or inactive.",
    );
    const selected = ["smc", "eo", "schoolLeader"].map((k) => read.fields[k]);
    fail(
      selected.every((f) => f.record?.state === "accepted"),
      "AUTHORITY_EVIDENCE_MISSING",
      403,
      "Required authority records are incomplete.",
    );
    const value = (k) =>
      read.fields[k].state === "effective" &&
      read.fields[k].record.value === true;
    if (value("smc")) {
      caps.add("deploy.read");
      for (const x of [
        "roster.read",
        "roster.write",
        "roster.publish",
        "roster.allocate",
      ])
        caps.add(x);
      if (value("eo") || value("schoolLeader")) {
        caps.add("deploy.edit");
        caps.add("deploy.publish");
      }
    }
    authority = read;
  }
  fail(
    caps.has(d.action),
    "CAPABILITY_DENIED",
    403,
    "You do not have permission for this action.",
  );
  if (impersonating && d.write)
    throw new ApiError("IMPERSONATION_DENIED", 403, "Preview is read-only.");
  let validUntil = Math.min(
    s.expires_at,
    ...grants.map((g) => g.valid_until ?? s.expires_at),
    ...targetGrants.map((g) => g.valid_until ?? s.expires_at),
  );
  if (
    observation?.eligibility?.employmentActive?.validUntil !== null &&
    observation?.eligibility?.employmentActive?.validUntil !== undefined
  )
    validUntil = Math.min(
      validUntil,
      observation.eligibility.employmentActive.validUntil,
    );
  if (authority)
    for (const f of Object.values(authority.fields))
      if (f.record)
        validUntil = Math.min(
          validUntil,
          f.record.validUntil ?? validUntil,
          f.record.validFrom > now ? f.record.validFrom : validUntil,
        );
  fail(validUntil > now, "AUTHORITY_CHANGED", 409, "Authority expired.");
  const dependencies = [
    {
      owner: "core",
      scope: `account:${a.account_id}`,
      revision: String(a.revision),
      validUntil,
    },
  ];
  if (impersonating)
    dependencies.push({
      owner: "core",
      scope: `account:${target.account_id}`,
      revision: String(target.revision),
      validUntil,
    });
  if (authority)
    dependencies.push({
      owner: "contacts",
      scope: `staff:${target.staff_id}`,
      revision: String(observation.staffRevision),
      validUntil,
    });
  let decisionId = crypto.randomUUID(),
    coreRevision = `core-${a.revision}-session-${s.revision}`;
  // Reuse the exact merged Deploy predicate and provider semantics at its real boundary.
  if (d.action.startsWith("deploy.")) {
    const readCore = async (q) => {
      const current = await readAccount(
        env,
        input.sessionToken,
        Math.max(now, Date.now()),
      );
      return {
        schemaVersion: 1,
        schoolId: env.SCHOOL_ID,
        evaluationId: q.evaluationId,
        current: true,
        asOf: Math.max(q.requestedAt, Date.now()),
        revision: `core-${current.a.revision}-session-${current.s.revision}`,
        sequence: current.a.revision + current.s.revision,
        policyVersion: "deploy-capabilities/1",
        account: accountEvidence(current.a, current.grants),
        session: sessionEvidence(current.s, current.a),
        previewAccount: impersonating
          ? accountEvidence(target, targetGrants)
          : null,
        previewGrant: impersonating
          ? {
              schoolId: env.SCHOOL_ID,
              actorAccountId: a.account_id,
              subjectAccountId: target.account_id,
              revision: `preview-${a.revision}`,
              permission: interval(true),
              fieldScope: ["deploy.planning"],
            }
          : null,
      };
    };
    const providerReader = {
      readAcceptedFacts: async (q) => {
        const fresh = createContactsReader({
          schoolId: env.SCHOOL_ID,
          clock: () => Math.max(now, Date.now()),
          readCurrent: async (query) => {
            const r = await serviceCall(
              env,
              "contacts",
              "/internal/authority",
              { query, sessionToken: input.sessionToken },
            );
            observation = r;
            return r.read;
          },
        });
        const r = await fresh.readAcceptedFacts(q);
        if (r.kind === "current") authority = r;
        return r;
      },
    };
    const resolver = createAuthority({
      clock: () => Math.max(now, Date.now()),
      schoolId: env.SCHOOL_ID,
      callers: [
        {
          serviceId: "deploy",
          schoolId: env.SCHOOL_ID,
          actions: ["deploy.read", "deploy.edit", "deploy.publish"],
        },
      ],
      readCore,
      readContacts: targetAdmin
        ? undefined
        : createCoreProvider({
            reader: providerReader,
            schoolId: env.SCHOOL_ID,
          }),
    });
    const request = {
      schemaVersion: 1,
      requestId: d.requestId ?? crypto.randomUUID(),
      schoolId: env.SCHOOL_ID,
      action: d.action,
      resource: {
        domain: "deploy",
        schoolId: env.SCHOOL_ID,
        ...(d.resourceId ? { resourceId: d.resourceId } : {}),
      },
      ...(d.operationId ? { operationId: d.operationId } : {}),
    };
    const decision = await resolver.resolveAuthority(request, {
      schemaVersion: 1,
      serviceId: "deploy",
      schoolId: env.SCHOOL_ID,
      actorAccountId: a.account_id,
      sessionId: s.session_id,
      ...(impersonating ? { previewAccountId: target.account_id } : {}),
    });
    fail(
      decision.outcome === "allow",
      decision.reasonCode,
      decision.outcome === "unavailable" ? 503 : decision.retryable ? 409 : 403,
      "Current Deploy authority was not confirmed.",
    );
    decisionId = decision.decisionId;
    coreRevision = decision.coreRevision;
    if (authority) {
      const dep = dependencies.find((x) => x.owner === "contacts");
      if (dep)
        fail(
          dep.revision === String(observation.staffRevision),
          "AUTHORITY_CHANGED",
          409,
          "Contacts changed during evaluation.",
        );
    }
  }
  // Catch changes while the remote owner was observed; pins enforce the later commit boundary.
  const final = await one(
    env.DB,
    "SELECT revision,suspended,pending_change FROM core_accounts WHERE school_id=? AND account_id=?",
    [env.SCHOOL_ID, a.account_id],
  );
  fail(
    final?.revision === a.revision && !final.suspended && !final.pending_change,
    "AUTHORITY_CHANGED",
    409,
    "Authority changed during this request.",
  );
  const principal = {
    action: d.action,
    requestDigest: d.bodyDigest ?? null,
    schoolId: env.SCHOOL_ID,
    actorId: a.account_id,
    subjectAccountId: target.account_id,
    staffId: target.staff_id,
    actorStaffId: a.staff_id,
    sessionId: s.session_id,
    email: target.email,
    impersonating,
    capabilities: [...caps].sort(),
    decisionId,
    validUntil,
    revisions: {
      core: coreRevision,
      contacts: authority?.snapshot.revision ?? null,
    },
    dependencies,
  };
  const event = d.action.startsWith("deploy.")
    ? createSecurityAudit({
        clock: () => Math.max(now, Date.now()),
      }).projectSecurityAudit({
        schemaVersion: 1,
        kind: "privileged-decision",
        eventId: decisionId,
        requestId: d.requestId ?? decisionId,
        schoolId: env.SCHOOL_ID,
        action: d.action,
        outcome: "allow",
        reasonCode: "CAPABILITY_ALLOWED",
        ...(d.operationId ? { operationId: d.operationId } : {}),
        actorAccountId: a.account_id,
        policyVersion: "deploy-capabilities/1",
        coreRevision,
        contactsRevision: authority?.snapshot.revision,
        evaluatedAt: now,
      })
    : {
        schemaVersion: 2,
        kind: "privileged-decision",
        eventId: decisionId,
        schoolId: env.SCHOOL_ID,
        actorAccountId: a.account_id,
        action: d.action,
        outcome: "allow",
        evaluatedAt: now,
      };
  const evidence = {
    schemaVersion: 1,
    schoolId: env.SCHOOL_ID,
    decisionId,
    actor: {
      accountId: a.account_id,
      staffId: a.staff_id,
      linkageRevision: `link-${a.revision}`,
    },
    subject: {
      accountId: target.account_id,
      staffId: target.staff_id,
      linkageRevision: `link-${target.revision}`,
    },
    evaluatedAt: now,
    core: {
      revision: coreRevision,
      account: accountEvidence(a, grants),
      session: sessionEvidence(s, a),
    },
    contacts: authority
      ? {
          kind: "observed",
          eligibility: observation.eligibility ?? null,
          snapshot: authority.snapshot,
          contentDigest: authority.contentDigest,
          observation: authority.observation,
          staffRevision: observation.staffRevision,
        }
      : { kind: "contacts-not-required" },
    destination: {
      service: d.service,
      operationId: d.operationId ?? null,
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
      canonical(d),
      d.bodyDigest ?? null,
      now,
      validUntil,
    ],
  ).run();
  return principal;
}
export function policy(method, path, body = {}) {
  if (
    (method === "GET" && path === "/config") ||
    (method === "POST" && ["/login", "/login/start"].includes(path))
  )
    return { public: true, action: "core.session", write: false };
  if (method === "GET" && path === "/session")
    return { action: "core.session", write: false };
  if (method === "POST" && path === "/logout")
    return { action: "core.session", write: true };
  if (
    path === "/health" ||
    path.startsWith("/evidence/") ||
    path.startsWith("/admin/")
  )
    return {
      action: "core.admin",
      write: method !== "GET",
      resourceId: body.accountId ?? "admin",
    };
  throw new ApiError("NOT_FOUND", 404, "Unknown Core operation.");
}
async function sessionResponse(env, principal) {
  const s = await one(
    env.DB,
    "SELECT * FROM core_sessions WHERE school_id=? AND session_id=?",
    [env.SCHOOL_ID, principal.sessionId],
  );
  return {
    schoolId: env.SCHOOL_ID,
    user: {
      accountId: principal.actorId,
      subjectAccountId: principal.subjectAccountId,
      email: principal.email,
      staffId: principal.staffId,
      roles: principal.capabilities,
    },
    capabilities: principal.capabilities,
    csrfToken: s.csrf_token,
    expiresAt: s.expires_at,
    impersonating: principal.impersonating,
  };
}
export async function handle(ctx) {
  const { env, path, method, body = {}, request, principal, now } = ctx;
  env.SERVICE_NAME ??= "core";
  if (ctx.internal) {
    if (path === "/internal/contribution-authority")
      return authorizeContribution(env, body, now);
    if (path === "/internal/authorize") return authorizeCore(env, body, now);
    if (path === "/internal/delegate") return delegateDecision(env, body, now);
    if (path === "/internal/session-proof") {
      const r = await readAccount(env, body.sessionToken, now);
      return {
        schoolId: env.SCHOOL_ID,
        accountId: r.a.account_id,
        staffId: r.a.staff_id,
        admin: r.grants.some((g) => g.capability === "admin"),
        validUntil: r.s.expires_at,
      };
    }
    if (path === "/internal/decision") {
      const r = await one(
        env.DB,
        "SELECT * FROM core_evidence WHERE school_id=? AND decision_id=?",
        [env.SCHOOL_ID, body.decisionId],
      );
      fail(
        r && (body.allowHistorical === true || r.valid_until > now),
        "AUTHORITY_CHANGED",
        409,
        "Decision is unavailable or expired.",
      );
      const descriptor = JSON.parse(r.descriptor_json),
        p = JSON.parse(r.principal_json);
      fail(
        (!body.schoolId || body.schoolId === env.SCHOOL_ID) &&
          (!body.operationId || descriptor.operationId === body.operationId) &&
          (!body.service || descriptor.service === body.service) &&
          (!body.actions || body.actions.includes(descriptor.action)),
        "SERVICE_DENIED",
        403,
        "Decision is bound to another operation.",
      );
      return { principal: p, descriptor };
    }
    if (
      path === "/internal/pins/acquire" &&
      body.scope?.startsWith("service:roster:")
    )
      return acquireSourcePin(
        env,
        body,
        {
          sql: "SELECT EXISTS(SELECT 1 FROM core_service_grants WHERE school_id=? AND service='roster' AND capability=? AND enabled=1 AND CAST(revision AS TEXT)=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?))",
          args: [
            env.SCHOOL_ID,
            body.scope.slice(15),
            String(body.revision),
            now,
            now,
          ],
        },
        now,
      );
    if (path === "/internal/pins/acquire") {
      const id = body.scope?.startsWith("account:")
        ? body.scope.slice(8)
        : null;
      fail(validId(id));
      return acquireSourcePin(
        env,
        body,
        {
          sql: "SELECT EXISTS(SELECT 1 FROM core_accounts WHERE school_id=? AND account_id=? AND CAST(revision AS TEXT)=? AND suspended=0 AND pending_change=0)",
          args: [env.SCHOOL_ID, id, String(body.revision)],
        },
        now,
      );
    }
    if (path === "/internal/pins/release")
      return releaseSourcePin(env, body, now);
    if (path === "/internal/evidence/receipt") {
      const row = await one(
        env.DB,
        "SELECT principal_json,descriptor_json FROM core_evidence WHERE school_id=? AND decision_id=?",
        [env.SCHOOL_ID, body.decisionId],
      );
      fail(row, "NOT_FOUND", 404);
      const p = JSON.parse(row.principal_json),
        d = JSON.parse(row.descriptor_json);
      fail(
        d.service === body.destination && d.operationId === body.operationId,
        "SERVICE_DENIED",
        403,
        "Receipt belongs to another decision.",
      );
      const target = await serviceCall(
        env,
        d.service,
        "/internal/operation-status",
        { schoolId: env.SCHOOL_ID, operationId: body.operationId },
      );
      fail(
        target &&
          ["committed", "aborted"].includes(target.state) &&
          target.actorId === p.actorId &&
          target.requestDigest === d.bodyDigest &&
          target.authorityAction === d.action,
        "RECEIPT_UNCONFIRMED",
        409,
        "The destination has not confirmed its immutable result.",
      );
      const old = await one(
        env.DB,
        "SELECT * FROM core_destination_receipts WHERE school_id=? AND decision_id=? AND destination=? AND operation_id=?",
        [env.SCHOOL_ID, body.decisionId, d.service, body.operationId],
      );
      if (old) {
        fail(
          old.digest === target.digest &&
            old.receipt_json === canonical(target.receipt),
          "RECEIPT_CONFLICT",
          409,
        );
        return {
          recorded: true,
          decisionId: body.decisionId,
          operationId: body.operationId,
        };
      }
      await statement(
        env.DB,
        "INSERT INTO core_destination_receipts(school_id,decision_id,destination,operation_id,digest,receipt_json,recorded_at) VALUES(?,?,?,?,?,?,?)",
        [
          env.SCHOOL_ID,
          body.decisionId,
          d.service,
          body.operationId,
          target.digest,
          canonical(target.receipt),
          now,
        ],
      ).run();
      return {
        recorded: true,
        decisionId: body.decisionId,
        operationId: body.operationId,
      };
    }
    if (path === "/internal/grants") {
      const sourceDecisionId = body.decisionId ?? body.sourceDecisionId,
        sourceOperationId = body.sourceOperationId ?? body.operationId;
      const capabilities = body.capabilities ?? body.calendarCapabilities;
      fail(
        Array.isArray(capabilities) &&
          capabilities.every((c) =>
            [
              "calendar.read",
              "calendar.parent.edit",
              "calendar.admin",
            ].includes(c),
          ) &&
          validId(body.targetAccountId) &&
          Number.isSafeInteger(body.revision),
      );
      const intent = {
          targetAccountId: body.targetAccountId,
          capabilities: [...new Set(capabilities)].sort(),
          revision: body.revision,
          sourceOperationId,
        },
        operationId = `calendar-grants-${await digest([sourceOperationId, body.targetAccountId])}`;
      const p = await delegateDecision(
        env,
        {
          sourceDecisionId,
          sourceOperationId,
          destination: "core",
          action: "core.calendar-grants",
          operationId,
          intent,
          resourceId: body.targetAccountId,
        },
        now,
      );
      const op = await prepareOperation(env.DB, {
        schoolId: env.SCHOOL_ID,
        actorId: p.actorId,
        operationId,
        action: "core.calendar-grants",
        intent,
        now,
        validUntil: p.validUntil,
        authorization: p,
      });
      if (op.receipt) return op.receipt;
      const target = await one(
        env.DB,
        "SELECT * FROM core_accounts WHERE school_id=? AND account_id=?",
        [env.SCHOOL_ID, body.targetAccountId],
      );
      fail(
        target,
        "IDENTITY_UNLINKED",
        409,
        "Select an existing verified account.",
      );
      const scope = `account:${body.targetAccountId}`;
      let held = await queueSourceChange(
        env.DB,
        env.SCHOOL_ID,
        scope,
        operationId,
        now,
        env.SERVICE_NAME,
      );
      if (held.length) {
        await requestSourceCancellations(env, held);
        held = await queueSourceChange(
          env.DB,
          env.SCHOOL_ID,
          scope,
          operationId,
          now,
          env.SERVICE_NAME,
        );
      }
      if (held.length)
        return { state: "pending", operationId, reason: "SOURCE_PIN_HELD" };
      const admission = await admit(env, env.DB, op, p, [], now),
        guards = [
          sourceChangeGuard(
            env.SCHOOL_ID,
            scope,
            operationId,
            env.SERVICE_NAME,
          ),
          {
            sql: "SELECT EXISTS(SELECT 1 FROM core_accounts WHERE school_id=? AND account_id=? AND revision=?) AS ok",
            args: [env.SCHOOL_ID, body.targetAccountId, body.revision],
          },
        ];
      if (!capabilities.includes("calendar.admin"))
        guards.push({
          sql: "SELECT NOT EXISTS(SELECT 1 FROM core_grants WHERE school_id=? AND account_id=? AND capability='calendar.admin') OR EXISTS(SELECT 1 FROM core_grants g JOIN core_accounts a ON a.school_id=g.school_id AND a.account_id=g.account_id WHERE g.school_id=? AND g.account_id<>? AND g.capability IN('calendar.admin','admin') AND a.suspended=0 AND g.valid_from<=? AND (g.valid_until IS NULL OR g.valid_until>?)) AS ok",
          args: [
            env.SCHOOL_ID,
            body.targetAccountId,
            env.SCHOOL_ID,
            body.targetAccountId,
            now,
            now,
          ],
        });
      const writes = [
        {
          sql: "DELETE FROM core_grants WHERE school_id=? AND account_id=? AND capability IN('calendar.read','calendar.parent.edit','calendar.admin')",
          args: [env.SCHOOL_ID, body.targetAccountId],
        },
        ...intent.capabilities.map((capability) => ({
          sql: "INSERT INTO core_grants(school_id,account_id,capability,valid_from) VALUES(?,?,?,?)",
          args: [env.SCHOOL_ID, body.targetAccountId, capability, now],
        })),
        {
          sql: "UPDATE core_accounts SET revision=revision+1 WHERE school_id=? AND account_id=?",
          args: [env.SCHOOL_ID, body.targetAccountId],
        },
        sourceChangeDone(env.SCHOOL_ID, scope, operationId),
      ];
      const result = await commitOperation(env.DB, op, {
        now,
        admission,
        guards,
        writes,
        result: {
          accountId: body.targetAccountId,
          capabilities: intent.capabilities,
          revision: target.revision + 1,
        },
        audit: {
          kind: "delegated-calendar-grants",
          sourceDecisionId,
          targetAccountId: body.targetAccountId,
        },
      });
      await resolveAdmission(env, env.DB, op, admission, result, now);
      return result;
    }
    if (path === "/internal/accounts") {
      const r = await one(
        env.DB,
        "SELECT principal_json,descriptor_json,valid_until FROM core_evidence WHERE school_id=? AND decision_id=?",
        [env.SCHOOL_ID, body.decisionId],
      );
      fail(r && r.valid_until > now, "AUTHORITY_CHANGED", 409);
      const p = JSON.parse(r.principal_json),
        d = JSON.parse(r.descriptor_json);
      fail(
        d.service === "calendar" &&
          (p.capabilities.includes("calendar.admin") ||
            p.capabilities.includes("admin")),
        "CAPABILITY_DENIED",
        403,
      );
      const rows = await query(
        env.DB,
        "SELECT account_id AS accountId,staff_id AS staffId,email,revision FROM core_accounts WHERE school_id=? AND suspended=0 ORDER BY email LIMIT 513",
        [env.SCHOOL_ID],
      );
      fail(rows.length <= 512, "ACCOUNT_BOUNDS", 413);
      const grants = await query(
        env.DB,
        "SELECT account_id,capability FROM core_grants WHERE school_id=? AND capability LIKE 'calendar.%' AND valid_from<=? AND (valid_until IS NULL OR valid_until>?)",
        [env.SCHOOL_ID, now, now],
      );
      return {
        rows: rows.map((r) => ({
          ...r,
          displayName: r.email,
          capabilities: grants
            .filter((g) => g.account_id === r.accountId)
            .map((g) => g.capability),
        })),
      };
    }
    if (path === "/internal/job-authority") {
      fail(
        body.schoolId === env.SCHOOL_ID &&
          ["calendar", "venues"].includes(body.destination),
        "SERVICE_DENIED",
        403,
      );
      const row = await one(
        env.DB,
        "SELECT principal_json,descriptor_json FROM core_evidence WHERE school_id=? AND decision_id=?",
        [env.SCHOOL_ID, body.decisionId],
      );
      fail(row, "AUTHORITY_CHANGED", 409);
      const old = JSON.parse(row.principal_json),
        descriptor = JSON.parse(row.descriptor_json);
      fail(
        descriptor.service === body.destination &&
          descriptor.operationId === body.operationId,
        "SERVICE_DENIED",
        403,
      );
      const receipt = await serviceCall(
        env,
        body.destination,
        "/internal/operation-status",
        { schoolId: env.SCHOOL_ID, operationId: body.operationId },
      );
      fail(
        receipt?.state === "committed" &&
          receipt.actorId === old.actorId &&
          receipt.requestDigest === descriptor.bodyDigest,
        "RECEIPT_UNCONFIRMED",
        409,
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
          account.staff_id === (old.actorStaffId ?? old.staffId),
        "AUTHORITY_CHANGED",
        403,
      );
      const grants = await query(
        env.DB,
        "SELECT capability,valid_until FROM core_grants WHERE school_id=? AND account_id=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?)",
        [env.SCHOOL_ID, old.actorId, now, now],
      );
      const caps = new Set(grants.map((g) => g.capability));
      if (caps.has("admin")) for (const cap of ACTIONS) caps.add(cap);
      if (caps.has("calendar.admin"))
        for (const cap of [
          "calendar.read",
          "calendar.edit",
          "calendar.parent.edit",
        ])
          caps.add(cap);
      if (caps.has("venues.admin"))
        for (const cap of ["venues.read", "venues.book", "venues.manage"])
          caps.add(cap);
      fail(caps.has(descriptor.action), "CAPABILITY_DENIED", 403);
      const decisionId = crypto.randomUUID(),
        validUntil = Math.min(
          now + 60000,
          ...grants.map((g) => g.valid_until ?? now + 60000),
        );
      const p = {
        schoolId: env.SCHOOL_ID,
        actorId: old.actorId,
        actorStaffId: account.staff_id,
        staffId: account.staff_id,
        sessionId: null,
        impersonating: false,
        capabilities: [...caps],
        decisionId,
        validUntil,
        revisions: { core: String(account.revision) },
        dependencies: [],
      };
      const binding = {
        service: body.destination,
        action: descriptor.action,
        write: false,
        operationId: body.operationId,
        purpose: body.purpose ?? "job",
        originalDecisionId: body.decisionId,
      };
      await statement(
        env.DB,
        "INSERT INTO core_evidence(school_id,decision_id,event_json,evidence_json,principal_json,descriptor_json,created_at,valid_until) VALUES(?,?,?,?,?,?,?,?)",
        [
          env.SCHOOL_ID,
          decisionId,
          canonical({
            schemaVersion: 2,
            eventId: decisionId,
            schoolId: env.SCHOOL_ID,
            kind: "job-authority",
            evaluatedAt: now,
          }),
          canonical({
            schemaVersion: 1,
            decisionId,
            originalDecisionId: body.decisionId,
            coreRevision: account.revision,
            evaluatedAt: now,
            contacts: { kind: "contacts-not-required" },
          }),
          canonical(p),
          canonical(binding),
          now,
          validUntil,
        ],
      ).run();
      return { allowed: true, decisionId, validUntil, principal: p };
    }
    if (
      path === "/internal/dispatch-check" &&
      body.purpose === "venues.notification"
    ) {
      fail(
        body.schoolId === env.SCHOOL_ID &&
          validId(body.jobId) &&
          validId(body.staffId),
        "SERVICE_DENIED",
        403,
      );
      const proof = await serviceCall(
        env,
        "venues",
        "/internal/notification-recipient",
        { schoolId: env.SCHOOL_ID, jobId: body.jobId, staffId: body.staffId },
      );
      fail(
        proof.allowed && proof.decisionId === body.decisionId,
        "CAPABILITY_DENIED",
        403,
        "This recipient is not part of the current notification.",
      );
      const checked = await handle({
        ...ctx,
        path: "/internal/job-authority",
        body: {
          schoolId: env.SCHOOL_ID,
          decisionId: body.decisionId,
          operationId: proof.operationId,
          destination: "venues",
          purpose: "venues.notification",
        },
      });
      const row = await one(
        env.DB,
        "SELECT principal_json,descriptor_json FROM core_evidence WHERE school_id=? AND decision_id=?",
        [env.SCHOOL_ID, checked.decisionId],
      );
      const p = JSON.parse(row.principal_json),
        d = JSON.parse(row.descriptor_json);
      p.capabilities = ["venues.notification"];
      p.recipientStaffId = body.staffId;
      d.jobId = body.jobId;
      d.recordRevision = proof.recordRevision;
      const decisionId = crypto.randomUUID();
      p.decisionId = decisionId;
      await statement(
        env.DB,
        "INSERT INTO core_evidence(school_id,decision_id,event_json,evidence_json,principal_json,descriptor_json,created_at,valid_until) VALUES(?,?,?,?,?,?,?,?)",
        [
          env.SCHOOL_ID,
          decisionId,
          canonical({
            schemaVersion: 2,
            eventId: decisionId,
            kind: "notification-recipient",
            schoolId: env.SCHOOL_ID,
            evaluatedAt: now,
          }),
          canonical({
            schemaVersion: 1,
            decisionId,
            sourceDecisionId: checked.decisionId,
            recipientStaffId: body.staffId,
            ownerProof: proof,
            evaluatedAt: now,
          }),
          canonical(p),
          canonical(d),
          now,
          checked.validUntil,
        ],
      ).run();
      return {
        allowed: true,
        decisionId,
        staffId: body.staffId,
        validUntil: checked.validUntil,
      };
    }
    if (path === "/internal/dispatch-check") {
      fail(
        body.schoolId === env.SCHOOL_ID &&
          ["lord.notification", "lord.references"].includes(body.purpose) &&
          (body.purpose === "lord.references" || validId(body.staffId)),
        "SERVICE_DENIED",
        403,
      );
      const r = await one(
        env.DB,
        "SELECT principal_json,descriptor_json FROM core_evidence WHERE school_id=? AND decision_id=?",
        [env.SCHOOL_ID, body.decisionId],
      );
      fail(r, "AUTHORITY_CHANGED", 409);
      const old = JSON.parse(r.principal_json),
        d = JSON.parse(r.descriptor_json);
      fail(
        d.service === "lord" &&
          ["lord.borrow", "lord.admin"].includes(d.action),
        "SERVICE_DENIED",
        403,
      );
      const account = await one(
        env.DB,
        "SELECT * FROM core_accounts WHERE school_id=? AND account_id=?",
        [env.SCHOOL_ID, old.actorId],
      );
      if (
        !account ||
        account.suspended ||
        account.pending_change ||
        account.staff_id !== (old.actorStaffId ?? old.staffId)
      )
        return { allowed: false, reason: "ACCOUNT_SUSPENDED" };
      const grants = await query(
        env.DB,
        "SELECT capability,valid_until FROM core_grants WHERE school_id=? AND account_id=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?)",
        [env.SCHOOL_ID, old.actorId, now, now],
      );
      const admin = grants.some((g) =>
        ["admin", "lord.admin"].includes(g.capability),
      );
      if (
        (body.purpose === "lord.references" &&
          (!admin || d.action !== "lord.admin")) ||
        (!admin && !grants.some((g) => g.capability === "lord.borrow")) ||
        (body.purpose === "lord.notification" &&
          !admin &&
          account.staff_id !== body.staffId)
      )
        return { allowed: false, reason: "CAPABILITY_DENIED" };
      const decisionId = crypto.randomUUID(),
        validUntil = Math.min(
          now + 60000,
          ...grants.map((g) => g.valid_until ?? now + 60000),
        );
      const p = {
        schoolId: env.SCHOOL_ID,
        actorId: old.actorId,
        staffId: account.staff_id,
        actorStaffId: account.staff_id,
        sessionId: null,
        impersonating: false,
        capabilities:
          body.purpose === "lord.references"
            ? ["lord.read", "lord.admin"]
            : ["lord.dispatch"],
        recipientStaffId: body.staffId ?? null,
        decisionId,
        validUntil,
        revisions: { core: String(account.revision) },
        dependencies: [],
      };
      const binding = {
        service: "lord",
        action: "lord.dispatch",
        write: false,
        purpose: body.purpose,
        originalDecisionId: body.decisionId,
      };
      const event = {
        schemaVersion: 2,
        eventId: decisionId,
        kind: "dispatch-revalidation",
        schoolId: env.SCHOOL_ID,
        actorAccountId: old.actorId,
        evaluatedAt: now,
      };
      await statement(
        env.DB,
        "INSERT INTO core_evidence(school_id,decision_id,event_json,evidence_json,principal_json,descriptor_json,created_at,valid_until) VALUES(?,?,?,?,?,?,?,?)",
        [
          env.SCHOOL_ID,
          decisionId,
          canonical(event),
          canonical({
            schemaVersion: 1,
            decisionId,
            originalDecisionId: body.decisionId,
            evaluatedAt: now,
            recipientStaffId: body.staffId ?? null,
            coreRevision: account.revision,
            contacts: { kind: "contacts-not-required" },
          }),
          canonical(p),
          canonical(binding),
          now,
          validUntil,
        ],
      ).run();
      return {
        allowed: true,
        staffId: body.staffId ?? null,
        revision: account.revision,
        decisionId,
        validUntil,
      };
    }
    throw new ApiError("NOT_FOUND", 404, "Unknown internal Core operation.");
  }
  if (path === "/config")
    return {
      schoolId: env.SCHOOL_ID,
      schoolName: env.SCHOOL_NAME ?? env.SCHOOL_ID,
      clientId: env.GOOGLE_CLIENT_ID ?? null,
      hostedDomain: env.HOSTED_DOMAIN ?? null,
      configured: !!(
        env.GOOGLE_CLIENT_ID &&
        env.HOSTED_DOMAIN &&
        env.PUBLIC_ORIGIN
      ),
    };
  if (path === "/login/start") {
    origin(env, request.headers.get("origin"));
    const challengeId = crypto.randomUUID(),
      nonce = crypto.randomUUID() + crypto.randomUUID();
    await statement(
      env.DB,
      "INSERT INTO core_nonces(challenge_id,nonce_hash,expires_at) VALUES(?,?,?)",
      [challengeId, await digest(nonce), now + 300000],
    ).run();
    return Response.json(
      { ok: true, data: { challengeId, nonce, expiresAt: now + 300000 } },
      {
        headers: {
          "set-cookie": `__Host-gsis_challenge=${challengeId}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=300`,
          "cache-control": "no-store",
        },
      },
    );
  }
  if (path === "/login") {
    origin(env, request.headers.get("origin"));
    fail(
      validId(body.challengeId) &&
        cookie(request, "__Host-gsis_challenge") === body.challengeId,
      "IDENTITY_INVALID",
      401,
      "Start sign-in again.",
    );
    const challenge = await one(
      env.DB,
      "SELECT * FROM core_nonces WHERE challenge_id=?",
      [body.challengeId],
    );
    fail(
      challenge && !challenge.used && challenge.expires_at > now,
      "IDENTITY_INVALID",
      401,
      "Sign-in challenge expired.",
    );
    const verified = await verifyIdentity(
      env,
      body.credential,
      challenge.nonce_hash,
      now,
    );
    let a = await one(
      env.DB,
      "SELECT * FROM core_accounts WHERE school_id=? AND issuer=? AND subject=?",
      [env.SCHOOL_ID, verified.identity.issuer, verified.identity.subject],
    );
    const bootstrap =
      !a &&
      env.BOOTSTRAP_SUBJECT === verified.identity.subject &&
      env.BOOTSTRAP_EMAIL === verified.email;
    fail(
      a || bootstrap,
      "IDENTITY_UNLINKED",
      401,
      "An administrator must register your Google account.",
    );
    fail(!a?.suspended, "ACCOUNT_SUSPENDED", 403, "This account is suspended.");
    const accountId = a?.account_id ?? crypto.randomUUID(),
      sessionId = crypto.randomUUID(),
      token = crypto.randomUUID() + crypto.randomUUID(),
      csrf = crypto.randomUUID(),
      assertId = crypto.randomUUID();
    const statements = [
      statement(
        env.DB,
        "INSERT INTO source_assertions(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM core_nonces WHERE challenge_id=? AND used=0 AND expires_at>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) AND ?>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))) THEN 1 ELSE 0 END",
        [assertId, body.challengeId, now, verified.expiresAt, now],
      ),
    ];
    if (bootstrap) {
      statements.push(
        statement(
          env.DB,
          "INSERT INTO core_bootstrap(school_id,account_id,created_at) VALUES(?,?,?)",
          [env.SCHOOL_ID, accountId, now],
        ),
      );
      statements.push(
        statement(
          env.DB,
          "INSERT INTO core_accounts(school_id,account_id,issuer,subject,email,created_at) VALUES(?,?,?,?,?,?)",
          [
            env.SCHOOL_ID,
            accountId,
            verified.identity.issuer,
            verified.identity.subject,
            verified.email,
            now,
          ],
        ),
      );
      statements.push(
        statement(
          env.DB,
          "INSERT INTO core_grants(school_id,account_id,capability,valid_from) VALUES(?,?,'admin',?)",
          [env.SCHOOL_ID, accountId, now],
        ),
      );
    } else
      statements.push(
        statement(
          env.DB,
          "INSERT INTO source_assertions(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM core_accounts WHERE school_id=? AND account_id=? AND revision=? AND suspended=0 AND pending_change=0) THEN 1 ELSE 0 END",
          [assertId + "-account", env.SCHOOL_ID, accountId, a.revision],
        ),
      );
    statements.push(
      statement(env.DB, "UPDATE core_nonces SET used=1 WHERE challenge_id=?", [
        body.challengeId,
      ]),
      statement(
        env.DB,
        "INSERT INTO core_sessions(school_id,session_id,token_hash,account_id,authenticated_at,expires_at,csrf_token) VALUES(?,?,?,?,?,?,?)",
        [
          env.SCHOOL_ID,
          sessionId,
          await digest(token),
          accountId,
          now,
          now + DURATION,
          csrf,
        ],
      ),
      statement(env.DB, "DELETE FROM source_assertions WHERE id IN(?,?)", [
        assertId,
        assertId + "-account",
      ]),
    );
    try {
      await env.DB.batch(statements);
    } catch {
      throw new ApiError(
        "IDENTITY_INVALID",
        401,
        "Sign-in challenge or account changed. Start again.",
      );
    }
    return Response.json(
      {
        ok: true,
        data: {
          schoolId: env.SCHOOL_ID,
          expiresAt: now + DURATION,
          csrfToken: csrf,
        },
      },
      {
        headers: {
          "set-cookie": `__Host-gsis_session=${token}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=864000`,
          "cache-control": "no-store",
        },
      },
    );
  }
  if (path === "/session") {
    let session = await sessionResponse(env, principal);
    if (
      !principal.impersonating &&
      !principal.capabilities.includes("admin") &&
      principal.staffId
    ) {
      try {
        const token =
          cookie(request, "__Host-gsis_session") ??
          request.headers.get("authorization")?.replace(/^Bearer /, "");
        const derived = await authorizeCore(
          env,
          {
            schoolId: env.SCHOOL_ID,
            sessionToken: token,
            descriptor: {
              service: "deploy",
              action: "deploy.read",
              write: false,
              bodyDigest: await digest({}),
            },
          },
          now,
        );
        session.capabilities = [
          ...new Set([...session.capabilities, ...derived.capabilities]),
        ];
        session.user.roles = session.capabilities;
        session.capabilityStatus = { deploy: "current" };
      } catch (e) {
        session.capabilityStatus = {
          deploy: e.status === 503 ? "unavailable" : "denied",
          reason: e.code,
        };
      }
    }
    return session;
  }
  if (path === "/admin/accounts" && method === "GET") {
    const accounts = await query(
        env.DB,
        "SELECT account_id AS accountId,email,staff_id AS staffId,revision,suspended,pending_change AS pendingChange FROM core_accounts WHERE school_id=? ORDER BY email LIMIT 513",
        [env.SCHOOL_ID],
      ),
      grants = await query(
        env.DB,
        "SELECT account_id AS accountId,capability,valid_from AS validFrom,valid_until AS validUntil FROM core_grants WHERE school_id=?",
        [env.SCHOOL_ID],
      );
    return {
      accounts,
      grants,
      rows: accounts.map((a) => ({
        ...a,
        capabilities: grants
          .filter(
            (g) =>
              g.accountId === a.accountId &&
              g.validFrom <= now &&
              (g.validUntil === null || g.validUntil > now),
          )
          .map((g) => g.capability),
      })),
    };
  }
  if (path === "/health" || path === "/admin/health")
    return {
      service: "core",
      schemaVersion: 1,
      configured: !!env.GOOGLE_CLIENT_ID,
      heldPins: await query(
        env.DB,
        "SELECT scope,pin_id AS pinId,destination,operation_id AS operationId,created_at AS createdAt FROM source_pins WHERE school_id=? AND state='held' ORDER BY created_at LIMIT 100",
        [env.SCHOOL_ID],
      ),
      retentionDeletionEnabled: false,
    };
  if (
    (path === "/admin/evidence" || path.startsWith("/evidence/")) &&
    method === "GET"
  ) {
    const id = path.startsWith("/evidence/")
      ? path.split("/")[2]
      : new URL(request.url).searchParams.get("decisionId");
    fail(validId(id));
    const r = await one(
      env.DB,
      "SELECT event_json,evidence_json,descriptor_json,receipt_json FROM core_evidence WHERE school_id=? AND decision_id=?",
      [env.SCHOOL_ID, id],
    );
    fail(r, "NOT_FOUND", 404, "Decision was not found.");
    return {
      event: JSON.parse(r.event_json),
      evidence: JSON.parse(r.evidence_json),
      binding: JSON.parse(r.descriptor_json),
      receipt: { ...JSON.parse(r.receipt_json), decisionId: id },
      destinations: (
        await query(
          env.DB,
          "SELECT destination,operation_id AS operationId,digest,receipt_json FROM core_destination_receipts WHERE school_id=? AND decision_id=?",
          [env.SCHOOL_ID, id],
        )
      ).map((x) => ({ ...x, receipt: JSON.parse(x.receipt_json) })),
    };
  }
  if (path === "/admin/service-grants" && method === "GET")
    return {
      rows: await query(
        env.DB,
        "SELECT service,capability,enabled,revision,valid_from AS validFrom,valid_until AS validUntil FROM core_service_grants WHERE school_id=?",
        [env.SCHOOL_ID],
      ),
    };
  if (path === "/admin/service-grants" && method === "POST") {
    fail(
      body.service === "roster" &&
        [
          "roster.allocate",
          "roster.publish",
          "roster.notify",
          "roster.export",
          "roster.inbound",
          "roster.external",
        ].includes(body.capability) &&
        typeof body.enabled === "boolean" &&
        Number.isSafeInteger(body.revision) &&
        body.revision >= 0,
    );
    const op = await prepareOperation(env.DB, {
      schoolId: env.SCHOOL_ID,
      actorId: principal.actorId,
      operationId: body.operationId,
      action: "core.admin",
      intent: body,
      now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
    if (op.receipt) return op.receipt;
    const scope = `service:roster:${body.capability}`;
    let pins = await queueSourceChange(
      env.DB,
      env.SCHOOL_ID,
      scope,
      op.operationId,
      now,
      env.SERVICE_NAME,
    );
    if (pins.length) {
      await requestSourceCancellations(env, pins);
      pins = await queueSourceChange(
        env.DB,
        env.SCHOOL_ID,
        scope,
        op.operationId,
        now,
        env.SERVICE_NAME,
      );
    }
    if (pins.length)
      return {
        state: "pending",
        operationId: op.operationId,
        reason: "SOURCE_PIN_HELD",
      };
    const admission = await admit(env, env.DB, op, principal, [], now);
    const r = await commitOperation(env.DB, op, {
      now,
      admission,
      guards: [
        sourceChangeGuard(
          env.SCHOOL_ID,
          scope,
          op.operationId,
          env.SERVICE_NAME,
        ),
        {
          sql: "SELECT COALESCE((SELECT revision FROM core_service_grants WHERE school_id=? AND service=? AND capability=?),0)=? AS ok",
          args: [env.SCHOOL_ID, "roster", body.capability, body.revision],
        },
      ],
      writes: [
        {
          sql: "INSERT INTO core_service_grants(school_id,service,capability,enabled,revision,valid_from,valid_until,granted_by) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(school_id,service,capability) DO UPDATE SET enabled=excluded.enabled,revision=excluded.revision,valid_from=excluded.valid_from,valid_until=excluded.valid_until,granted_by=excluded.granted_by",
          args: [
            env.SCHOOL_ID,
            "roster",
            body.capability,
            body.enabled ? 1 : 0,
            body.revision + 1,
            now,
            null,
            principal.actorId,
          ],
        },
        sourceChangeDone(env.SCHOOL_ID, scope, op.operationId),
      ],
      result: {
        service: "roster",
        capability: body.capability,
        enabled: body.enabled,
        revision: body.revision + 1,
      },
      audit: {
        kind: "scheduler-grant",
        service: "roster",
        capability: body.capability,
        enabled: body.enabled,
      },
    });
    await resolveAdmission(env, env.DB, op, admission, r, now);
    return r;
  }
  if (path === "/logout" || (path === "/admin/accounts" && method === "POST")) {
    const targetId = path === "/logout" ? principal.actorId : body.accountId;
    fail(validId(targetId));
    const target = await one(
      env.DB,
      "SELECT * FROM core_accounts WHERE school_id=? AND account_id=?",
      [env.SCHOOL_ID, targetId],
    );
    const creating = !target && path !== "/logout";
    if (creating)
      fail(
        typeof body.subject === "string" &&
          /^[A-Za-z0-9_-]{1,255}$/.test(body.subject) &&
          typeof body.email === "string" &&
          body.email.endsWith("@" + env.HOSTED_DOMAIN),
      );
    const op = await prepareOperation(env.DB, {
      schoolId: env.SCHOOL_ID,
      actorId: principal.actorId,
      operationId: body.operationId,
      action: path === "/logout" ? "core.session" : "core.admin",
      intent: body,
      now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
    if (op.receipt) return op.receipt;
    const sourceScope = `account:${targetId}`;
    let held = await queueSourceChange(
      env.DB,
      env.SCHOOL_ID,
      sourceScope,
      op.operationId,
      now,
      env.SERVICE_NAME,
    );
    if (held.length) {
      await requestSourceCancellations(env, held);
      held = await queueSourceChange(
        env.DB,
        env.SCHOOL_ID,
        sourceScope,
        op.operationId,
        now,
        env.SERVICE_NAME,
      );
    }
    if (held.length)
      return {
        state: "pending",
        operationId: op.operationId,
        reason: "SOURCE_PIN_HELD",
        pins: held.map((p) => p.pin_id),
      };
    // Suspension is pending while pins resolve; the pending source_changes row blocks new pins.
    const admission = await admit(env, env.DB, op, principal, [], now);
    const writes = [],
      guards = [
        sourceChangeGuard(
          env.SCHOOL_ID,
          sourceScope,
          op.operationId,
          env.SERVICE_NAME,
        ),
      ];
    if (creating) {
      guards.push({
        sql: "SELECT NOT EXISTS(SELECT 1 FROM core_accounts WHERE school_id=? AND account_id=?) AS ok",
        args: [env.SCHOOL_ID, targetId],
      });
      writes.push({
        sql: "INSERT INTO core_accounts(school_id,account_id,issuer,subject,email,staff_id,created_at) VALUES(?,?,'https://accounts.google.com',?,?,?,?)",
        args: [
          env.SCHOOL_ID,
          targetId,
          body.subject,
          body.email,
          body.staffId ?? null,
          now,
        ],
      });
    } else {
      fail(path === "/logout" || Number.isSafeInteger(body.revision));
      guards.push({
        sql: "SELECT EXISTS(SELECT 1 FROM core_accounts WHERE school_id=? AND account_id=? AND revision=?) AS ok",
        args: [
          env.SCHOOL_ID,
          targetId,
          path === "/logout" ? target.revision : body.revision,
        ],
      });
      writes.push({
        sql: "UPDATE core_accounts SET revision=revision+1,staff_id=?,suspended=?,pending_change=0 WHERE school_id=? AND account_id=?",
        args: [
          path === "/logout"
            ? target.staff_id
            : (body.staffId ?? target.staff_id),
          path === "/logout"
            ? target.suspended
            : body.suspended === true
              ? 1
              : 0,
          env.SCHOOL_ID,
          targetId,
        ],
      });
    }
    if (path === "/logout")
      writes.push({
        sql: "UPDATE core_sessions SET revoked=1,revision=revision+1 WHERE school_id=? AND session_id=?",
        args: [env.SCHOOL_ID, principal.sessionId],
      });
    else if (body.capabilities !== undefined) {
      fail(
        Array.isArray(body.capabilities) &&
          body.capabilities.length <= 64 &&
          body.capabilities.every((c) => c === "admin" || ACTIONS.includes(c)),
      );
      if (!body.capabilities.includes("admin") || body.suspended === true)
        guards.push({
          sql: "SELECT NOT EXISTS(SELECT 1 FROM core_grants WHERE school_id=? AND account_id=? AND capability='admin') OR EXISTS(SELECT 1 FROM core_grants g JOIN core_accounts a ON a.school_id=g.school_id AND a.account_id=g.account_id WHERE g.school_id=? AND g.capability='admin' AND g.account_id<>? AND a.suspended=0 AND g.valid_from<=? AND (g.valid_until IS NULL OR g.valid_until>?)) AS ok",
          args: [env.SCHOOL_ID, targetId, env.SCHOOL_ID, targetId, now, now],
        });
      writes.push({
        sql: "DELETE FROM core_grants WHERE school_id=? AND account_id=?",
        args: [env.SCHOOL_ID, targetId],
      });
      for (const capability of [...new Set(body.capabilities)])
        writes.push({
          sql: "INSERT INTO core_grants(school_id,account_id,capability,valid_from) VALUES(?,?,?,?)",
          args: [env.SCHOOL_ID, targetId, capability, now],
        });
    } else if (body.suspended === true)
      guards.push({
        sql: "SELECT NOT EXISTS(SELECT 1 FROM core_grants WHERE school_id=? AND account_id=? AND capability='admin') OR EXISTS(SELECT 1 FROM core_grants g JOIN core_accounts a ON a.school_id=g.school_id AND a.account_id=g.account_id WHERE g.school_id=? AND g.capability='admin' AND g.account_id<>? AND a.suspended=0 AND g.valid_from<=? AND (g.valid_until IS NULL OR g.valid_until>?)) AS ok",
        args: [env.SCHOOL_ID, targetId, env.SCHOOL_ID, targetId, now, now],
      });
    writes.push(sourceChangeDone(env.SCHOOL_ID, sourceScope, op.operationId));
    const result = await commitOperation(env.DB, op, {
      now,
      guards,
      writes,
      result: { accountId: targetId, revision: (target?.revision ?? 0) + 1 },
      audit: {
        targetAccountId: targetId,
        kind: path === "/logout" ? "logout" : "account-change",
      },
      admission,
    });
    await resolveAdmission(env, env.DB, op, admission, result, now);
    if (path === "/logout")
      return Response.json(
        { ok: true, data: result },
        {
          headers: {
            "set-cookie":
              "__Host-gsis_session=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
            "clear-site-data": '"cache", "storage"',
            "cache-control": "no-store",
          },
        },
      );
    return result;
  }
  throw new ApiError("NOT_FOUND", 404, "Unknown Core operation.");
}
