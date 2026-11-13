import {
  signatureSettings,
  saveSignatureSettings,
  recoveryStatus,
  recoverSave,
  recalculate,
} from "./settings.mjs";
import { listContributions, resolveContribution } from "./contributions.mjs";
import { replaceField, validateMkeIntervals } from "./intervals.mjs";
import {
  saveCatalogue,
  deriveDisplay,
  validateAssignments,
  currentCatalogues,
} from "./catalogues.mjs";
import {
  birthdayIntents,
  dispatchContactsJobs,
  readCalendarBirthdays,
} from "./jobs.mjs";
export { recipientStaff, recipientMobile } from "./recipients.mjs";
export { readCalendarBirthdays } from "./jobs.mjs";
export function readAuthorityProjection(env, input, now = Date.now()) {
  return currentSnapshot(
    env,
    { ...input, requestedAt: input.requestedAt ?? now },
    now,
  );
}
import { saveGrid, gridReceipt } from "./grid.mjs";
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
  admit,
  resolveAdmission,
  serviceCall,
  inspectDecision,
  secureEqual,
  acquireSourcePin,
  releaseSourcePin,
  queueSourceChange,
  requestSourceCancellations,
  sourceChangeGuard,
  sourceChangeDone,
} from "../../runtime/admission.mjs";
import {
  AUTHORITY,
  SELF_FIELDS,
  DATA_FIELDS,
  record,
  records,
  staffRecord,
  publicStaff,
  effectiveField,
  sectionCode,
  validateValue,
  makeSnapshots,
  currentSnapshot,
} from "./store.mjs";
import { validateCatalogues } from "../../contacts/catalogues.mjs";
const validId = (v) =>
  typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(v);
const fail = (
  v,
  c = "INVALID_INPUT",
  s = 400,
  m = "Check the supplied values.",
) => {
  if (!v) throw new ApiError(c, s, m);
};
const w = (sql, args) => ({ sql, args });
function canManage(p) {
  return (
    p.capabilities.includes("contacts.manage") ||
    p.capabilities.includes("admin")
  );
}
export function policy(method, path, body = {}) {
  if (
    (method === "GET" &&
      ["/bootstrap", "/data", "/deployment", "/staff", "/diy"].includes(
        path,
      )) ||
    (method === "GET" && /^\/staff\/[^/]+$/.test(path))
  )
    return { action: "contacts.read", write: false };
  if (
    method === "GET" &&
    [
      "/readiness",
      "/audit",
      "/catalogues",
      "/health",
      "/contributions",
      "/recovery-status",
    ].includes(path)
  )
    return { action: "contacts.manage", write: false };
  if (method === "POST" && path === "/readiness/check")
    return { action: "contacts.manage", write: false };
  if (method === "POST" && path === "/projection")
    return {
      action:
        body.purpose === "deploy"
          ? "deploy.read"
          : body.purpose === "roster"
            ? "roster.read"
            : body.purpose === "lord"
              ? "lord.read"
              : body.purpose === "venues"
                ? "venues.read"
                : body.purpose === "layout"
                  ? "layout.read"
                  : "contacts.read",
      write: false,
    };
  if (method === "POST" && path === "/save-receipt")
    return { action: "contacts.read", write: false };
  if (method === "POST" && path === "/save-diy")
    return { action: "contacts.self", write: true, resourceId: body.staffId };
  if (
    method === "POST" &&
    (path.startsWith("/staff/") ||
      [
        "/save-data",
        "/readiness/check",
        "/catalogues",
        "/contributions",
        "/contributions/resolve",
        "/save-signature-settings",
        "/recover-save",
        "/recalculate-data",
      ].includes(path))
  )
    return {
      action: "contacts.manage",
      write: true,
      resourceId: body.staffId ?? path.split("/")[2] ?? "directory",
    };
  throw new ApiError("NOT_FOUND", 404, "Unknown Contacts operation.");
}
async function allRows(env, now, privateFields = false) {
  const rows = await query(
    env.DB,
    "SELECT p.*,COALESCE(json_group_array(CASE WHEN f.field IS NOT NULL THEN json_object('field',f.field,'revision',f.revision,'state',f.state,'value_json',f.value_json,'timeline_json',f.timeline_json,'valid_from',f.valid_from,'valid_until',f.valid_until,'revoked',f.revoked,'proposer',f.proposer,'accepter',f.accepter,'accepted_at',f.accepted_at,'operation_id',f.operation_id) END),'[]') AS fields_json FROM contacts_staff p LEFT JOIN contacts_fields f ON f.school_id=p.school_id AND f.staff_id=p.staff_id WHERE p.school_id=? GROUP BY p.staff_id ORDER BY p.basic_name LIMIT 513",
    [env.SCHOOL_ID],
  );
  fail(
    rows.length <= 512,
    "DIRECTORY_BOUNDS",
    413,
    "The directory exceeds the supported scan bound.",
  );
  return rows.map((s) => ({
    staff: s,
    fields: Object.fromEntries(
      JSON.parse(s.fields_json)
        .filter(Boolean)
        .map((f) => [f.field, f]),
    ),
  }));
}
async function projection(env, body, principal, now) {
  fail(
    [
      "deploy",
      "roster",
      "lord",
      "lord.notification",
      "venues.notification",
      "venues",
      "layout",
      "calendar",
      "calendarBirthdays",
      "directory",
    ].includes(body.purpose),
  );
  fail(
    !body.schoolId || body.schoolId === env.SCHOOL_ID,
    "SCHOOL_MISMATCH",
    403,
  );
  if (body.purpose === "lord")
    fail(
      principal.capabilities.includes("lord.admin") ||
        principal.capabilities.includes("admin"),
      "CAPABILITY_DENIED",
      403,
      "LORD reference refresh requires administrator permission.",
    );
  if (["lord.notification", "venues.notification"].includes(body.purpose))
    fail(
      body.staffIds?.length === 1 &&
        body.staffIds[0] === principal.recipientStaffId,
      "CAPABILITY_DENIED",
      403,
    );
  const required = {
    calendarBirthdays: "calendar.admin",
    "venues.notification": "venues.notification",
    "lord.notification": "lord.dispatch",
    deploy: "deploy.read",
    roster: "roster.read",
    lord: "lord.read",
    venues: "venues.read",
    layout: "layout.read",
    calendar: "calendar.read",
    directory: "contacts.read",
  }[body.purpose];
  fail(
    principal.capabilities.includes(required) ||
      (body.purpose === "roster" &&
        principal.capabilities.includes("roster.own")) ||
      principal.capabilities.includes("admin"),
    "CAPABILITY_DENIED",
    403,
    "This projection is not permitted.",
  );
  if (body.purpose === "calendarBirthdays")
    return readCalendarBirthdays(env, now);
  if (body.staffIds)
    fail(
      Array.isArray(body.staffIds) &&
        body.staffIds.length <= 512 &&
        body.staffIds.every(validId),
    );
  const rows = (await allRows(env, now)).filter(
    (r) => !body.staffIds || body.staffIds.includes(r.staff.staff_id),
  );
  const staff = rows.map((r) => {
    const { fields: _fieldRecords, ...p } = publicStaff(r, now);
    const value = (name) => effectiveField(r.fields[name], now);
    const x = {
      ...p,
      eo: value("eo"),
      smc: value("smc"),
      schoolLeader: value("schoolLeader"),
      employment: value("employmentArrangement"),
      role: value("role"),
      employmentTags: value("employmentTags"),
      subjectTags: value("subjectTags"),
      groups: value("memberships"),
      profile: {
        state: r.staff.profile_state,
        section: value("schoolSection"),
        personnelCategory: value("personnelCategory"),
      },
      fieldRevisions: Object.fromEntries(
        Object.entries(r.fields).map(([k, v]) => [k, v.revision]),
      ),
    };
    if (
      body.purpose === "roster" &&
      (principal.capabilities.includes("admin") ||
        principal.capabilities.includes("roster.read") ||
        principal.staffId === x.staffId)
    ) {
      x.mobile = value("mobile");
      x.email = value("email");
    }
    if (
      ["lord", "lord.notification", "venues.notification"].includes(
        body.purpose,
      )
    )
      return {
        staffId: x.staffId,
        id: x.id,
        name: x.name,
        active: x.active,
        email: value("email"),
        mobile: value("mobile"),
        revision: x.revision,
      };
    if (body.purpose === "calendarBirthdays") {
      const birthday = value("birthday");
      return {
        staffId: x.staffId,
        id: x.id,
        name: x.name,
        active: x.active,
        birthday: typeof birthday === "string" ? birthday.slice(-5) : null,
        revision: x.revision,
      };
    }
    if (["venues", "layout", "calendar", "directory"].includes(body.purpose))
      return {
        staffId: x.staffId,
        id: x.id,
        name: x.name,
        ttbName: x.ttbName,
        active: x.active,
        revision: x.revision,
      };
    return x;
  });
  const epoch =
    (
      await one(
        env.DB,
        "SELECT revision FROM contacts_epoch WHERE school_id=?",
        [env.SCHOOL_ID],
      )
    )?.revision ?? 0;
  const catalogues =
    body.purpose === "deploy"
      ? await currentCatalogues(env.DB, env.SCHOOL_ID)
      : [];
  const dependencies = rows.map((r) => ({
    owner: "contacts",
    scope: `staff:${r.staff.staff_id}`,
    revision: String(r.staff.revision),
    validUntil: null,
  }));
  for (const c of catalogues)
    dependencies.push({
      owner: "contacts",
      scope: `catalogue:${c.catalogueId}`,
      revision: c.revision,
      validUntil: null,
    });
  const transition = rows.flatMap((r) =>
    Object.values(r.fields).flatMap((f) =>
      records(f)
        .filter((r) => r.state === "accepted")
        .flatMap((r) =>
          [r.validFrom, r.validUntil].filter((t) => t !== null && t > now),
        ),
    ),
  );
  return {
    schemaVersion: 1,
    schoolId: env.SCHOOL_ID,
    staff,
    people: staff,
    catalogues,
    smcIds: staff.filter((s) => s.smc === true).map((s) => s.staffId),
    revision: `contacts-${epoch}`,
    sequence: epoch,
    asOf: now,
    observation: { evaluationId: crypto.randomUUID(), asOf: now },
    dependencies,
    validUntil: transition.length ? Math.min(...transition) : null,
  };
}
async function readinessProof(env, report) {
  fail(
    typeof env.GSIS_SECRET === "string" && env.GSIS_SECRET.length > 0,
    "CONFIGURATION_REQUIRED",
    503,
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.GSIS_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(canonical(report)),
    ),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function readiness(env, now) {
  // One owner query reads the population, joined records and epoch from the same SQLite snapshot.
  const result = await query(
    env.DB,
    "SELECT p.staff_id,p.basic_name,p.revision,(SELECT revision FROM contacts_epoch WHERE school_id=p.school_id) AS epoch,f.field,f.state,f.value_json,f.timeline_json,f.valid_from,f.valid_until,f.revoked,f.revision AS field_revision FROM (SELECT * FROM contacts_staff WHERE school_id=? ORDER BY staff_id LIMIT 513) p LEFT JOIN contacts_fields f ON f.school_id=p.school_id AND f.staff_id=p.staff_id AND f.field IN('employmentActive','smc','eo','schoolLeader','schoolSection') UNION ALL SELECT NULL,NULL,NULL,(SELECT revision FROM contacts_epoch WHERE school_id=?),NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL",
    [env.SCHOOL_ID, env.SCHOOL_ID],
  );
  const staff = new Map();
  for (const row of result) {
    if (row.staff_id === null) continue;
    if (!staff.has(row.staff_id))
      staff.set(row.staff_id, {
        id: row.staff_id,
        name: row.basic_name,
        revision: row.revision,
        fields: {},
      });
    if (row.field)
      staff.get(row.staff_id).fields[row.field] = {
        ...row,
        revision: row.field_revision,
      };
  }
  if (
    staff.size > 512 ||
    new TextEncoder().encode(JSON.stringify(result)).length > 1048576
  )
    return {
      state: "incomplete",
      reason: "READINESS_BOUNDS",
      count: staff.size,
    };
  let epoch = result[0]?.epoch ?? 0,
    validUntil = now + 300000;
  const issues = [],
    inactive = [];
  let activeCount = 0,
    unknown = false;
  for (const s of staff.values()) {
    for (const f of Object.values(s.fields))
      for (const r of records(f))
        if (r.state === "accepted")
          for (const t of [r.validFrom, r.validUntil])
            if (t !== null && t > now) validUntil = Math.min(validUntil, t);
    const active = effectiveField(s.fields.employmentActive, now);
    if (active === false) {
      inactive.push({ staffId: s.id, name: s.name });
      continue;
    }
    if (active !== true) {
      unknown = true;
      issues.push({
        staffId: s.id,
        name: s.name,
        field: "employmentActive",
        reason: "UNKNOWN_ACTIVE",
      });
      continue;
    }
    activeCount++;
    for (const name of AUTHORITY) {
      const r = record(s.fields[name]);
      if (effectiveField(s.fields[name], now) === null)
        issues.push({
          staffId: s.id,
          name: s.name,
          field: name,
          reason:
            r.state === "accepted"
              ? "NONCURRENT_EVIDENCE"
              : "AUTHORITY_EVIDENCE_MISSING",
        });
    }
    if (
      effectiveField(s.fields.smc, now) === true &&
      ["MK", "MKE"].includes(
        sectionCode(effectiveField(s.fields.schoolSection, now)),
      )
    )
      issues.push({
        staffId: s.id,
        name: s.name,
        field: "smc",
        reason: "MKE_SMC_CONFLICT",
      });
  }
  // Cutover uses /readiness/check to compare this single-query snapshot epoch.
  const report = {
    schemaVersion: 1,
    schoolId: env.SCHOOL_ID,
    state: unknown ? "incomplete" : issues.length ? "blocked" : "ready",
    epoch,
    evaluatedAt: now,
    validUntil,
    count: staff.size,
    activeCount,
    issues,
    inactive,
    scanId: crypto.randomUUID(),
  };
  report.proof = await readinessProof(env, report);
  return report;
}
export async function handle(ctx) {
  const { env, path, method, body = {}, principal, request, now } = ctx;
  env.SERVICE_NAME ??= "contacts";
  if (ctx.internal) {
    if (path === "/internal/birthday-event") {
      fail(body.schoolId === env.SCHOOL_ID, "SCHOOL_MISMATCH", 403);
      const job = await one(
        env.DB,
        "SELECT j.payload_json,o.state FROM product_outbox j JOIN product_operations o ON o.school_id=j.school_id AND o.operation_id=j.operation_id WHERE j.school_id=? AND j.job_id=? AND j.operation_id=? AND j.type='contacts.birthdays'",
        [env.SCHOOL_ID, body.eventId, body.sourceOperationId],
      );
      fail(job && job.state === "committed", "SOURCE_UNCONFIRMED", 409);
      return {
        verified: true,
        state: "committed",
        ...JSON.parse(job.payload_json),
      };
    }
    if (path === "/internal/update-mobile") {
      const proof = await inspectDecision(env, body.decisionId, {
        schoolId: env.SCHOOL_ID,
        service: "roster",
        actions: ["roster.write"],
        operationId: body.operationId,
      });
      validateValue("mobile", body.mobile);
      fail(validId(body.staffId));
      const operationId = `mobile-${await digest(["roster", body.operationId])}`,
        intent = {
          operationId,
          staffId: body.staffId,
          changes: { mobile: body.mobile },
          fieldRevisions: { mobile: body.revision },
        };
      const p = await serviceCall(env, "core", "/internal/delegate", {
        sourceDecisionId: body.decisionId,
        sourceOperationId: body.operationId,
        destination: "contacts",
        action: "contacts.mobile",
        operationId,
        intent,
        resourceId: body.staffId,
      });
      return handle({
        ...ctx,
        internal: false,
        path: `/staff/${body.staffId}/update`,
        body: intent,
        principal: p,
      });
    }
    if (path === "/internal/register-provisional") {
      const sourceDecisionId = body.decisionId ?? body.originalDecisionId;
      const proof = await inspectDecision(env, sourceDecisionId, {
        schoolId: env.SCHOOL_ID,
        actions: ["deploy.edit", "roster.write"],
        operationId: body.operationId,
      });
      fail(
        typeof body.basicName === "string" &&
          body.basicName.trim().length > 0 &&
          body.basicName.length <= 160,
      );
      if (proof.descriptor.service === "roster")
        validateValue("mobile", body.mobile);
      else
        fail(
          body.mobile === undefined,
          "CAPABILITY_DENIED",
          403,
          "Deploy registration is name-only.",
        );
      const existing = await query(
        env.DB,
        "SELECT staff_id,basic_name,ttb_name FROM contacts_staff WHERE school_id=? AND lower(basic_name)=lower(?) ORDER BY staff_id",
        [env.SCHOOL_ID, body.basicName],
      );
      if (body.existingStaffId) {
        const selected = existing.find(
          (x) => x.staff_id === body.existingStaffId,
        );
        fail(selected, "IDENTITY_SELECTION_REQUIRED", 409);
        return {
          state: "existing",
          staffId: selected.staff_id,
          name: selected.basic_name,
        };
      }
      if (existing.length && !body.nameSuffix && !body.tags?.length)
        throw new ApiError(
          "IDENTITY_SELECTION_REQUIRED",
          409,
          "Select the existing active, inactive or provisional person before creating another.",
        );
      const tagChanges = {};
      if (body.tags) {
        fail(Array.isArray(body.tags) && body.tags.length <= 16);
        const catalogues = await currentCatalogues(env.DB, env.SCHOOL_ID);
        for (const code of body.tags) {
          fail(typeof code === "string");
          const found = catalogues.flatMap((c) =>
            c.kind === "operational-tag"
              ? c.entries
                  .filter((e) => e.active && e.code === code)
                  .map((e) => ({
                    field: e.category,
                    ref: {
                      catalogueId: c.catalogueId,
                      revision: c.revision,
                      code: e.code,
                    },
                  }))
              : [],
          );
          fail(
            found.length === 1,
            "CATALOGUE_SELECTION_REQUIRED",
            409,
            "Unknown tags require Contacts review before assignment.",
          );
          (tagChanges[found[0].field] ??= []).push(found[0].ref);
        }
      }
      const operationId = `provisional-${await digest([proof.descriptor.service, body.operationId])}`,
        intent = {
          operationId,
          ...tagChanges,
          ...(body.nameSuffix ? { nameSuffix: body.nameSuffix } : {}),
          staffId: `staff-${await digest([env.SCHOOL_ID, operationId])}`,
          basicName: body.basicName,
          ...(proof.descriptor.service === "roster"
            ? { mobile: body.mobile }
            : {}),
        };
      const p = await serviceCall(env, "core", "/internal/delegate", {
        sourceDecisionId,
        sourceOperationId: body.operationId,
        destination: "contacts",
        action: "contacts.provisional",
        operationId,
        intent,
        resourceId: intent.staffId,
      });
      return handle({
        ...ctx,
        internal: false,
        path: "/staff/create",
        body: intent,
        principal: p,
      });
    }
    if (path === "/internal/contributions") {
      fail(
        body.schoolId === env.SCHOOL_ID &&
          validId(body.sourceOperationId ?? body.operationId),
      );
      const proof = await serviceCall(
        env,
        "deploy",
        "/internal/publication/verify",
        {
          schoolId: env.SCHOOL_ID,
          publicationId: body.publicationId ?? body.sourcePublicationId,
          sourceOperationId: body.sourceOperationId,
          sourceDigest: body.sourceDigest,
          sourceFence: body.sourceFence,
        },
      );
      fail(
        proof.state === "committed" && Array.isArray(proof.contributions),
        "PUBLICATION_UNVERIFIED",
        409,
      );
      const original = await serviceCall(env, "core", "/internal/decision", {
        decisionId: proof.decisionId,
        schoolId: env.SCHOOL_ID,
        service: "deploy",
        actions: ["deploy.publish"],
        operationId: body.sourceOperationId,
        allowHistorical: true,
      });
      const allowedFields = [
        "basicName",
        "role",
        "appointmentStatus",
        "employmentArrangement",
        "employmentTags",
        "subjectTags",
        "employmentActive",
        "memberships",
      ];
      const offset = body.offset ?? 0,
        limit = body.limit ?? proof.contributions.length;
      fail(
        Number.isSafeInteger(offset) &&
          offset >= 0 &&
          Number.isSafeInteger(limit) &&
          limit >= 0 &&
          limit <= (body.offset === undefined ? 128 : 64),
      );
      const expected = proof.contributions.slice(offset, offset + limit),
        proposed = body.contributions ?? expected;
      fail(Array.isArray(proposed) && proposed.length <= 128);
      fail(
        (await digest(proposed)) === (await digest(expected)),
        "PUBLICATION_UNVERIFIED",
        409,
        "Contribution content differs from the immutable publication.",
      );
      const operationId =
          body.operationId ??
          `contributions-${await digest([body.publicationId ?? body.sourcePublicationId, body.sourceOperationId])}`,
        intent = {
          publicationId: body.publicationId ?? body.sourcePublicationId,
          sourceOperationId: body.sourceOperationId,
          offset,
          limit,
          contributions: proposed,
        };
      const op = await prepareOperation(env.DB, {
        schoolId: env.SCHOOL_ID,
        actorId: original.principal.actorId,
        operationId,
        action: "internal.contacts-contributions",
        intent,
        now,
        validUntil: now + 60000,
      });
      if (op.receipt) return op.receipt;
      const writes = [],
        outbox = [],
        statuses = [];
      for (const item of proposed) {
        fail(
          validId(item.staffId) && allowedFields.includes(item.field),
          "CONTRIBUTION_FIELD_DENIED",
          400,
        );
        const old = await one(
          env.DB,
          "SELECT staff_id FROM contacts_staff WHERE school_id=? AND staff_id=?",
          [env.SCHOOL_ID, item.staffId],
        );
        fail(old, "STAFF_MISMATCH", 409);
        fail(
          Number.isSafeInteger(item.acceptedBaseFieldRevision) &&
            item.acceptedBaseFieldRevision >= 0,
        );
        const contributionId = `contribution-${await digest([intent.publicationId, item.staffId, item.field])}`;
        const source = {
          publicationId: intent.publicationId,
          sourceOperationId: body.sourceOperationId,
          sourceDigest: body.sourceDigest,
          sourceFence: body.sourceFence,
        };
        writes.push(
          w(
            "UPDATE contacts_contributions SET state='superseded',outcome_json=? WHERE school_id=? AND staff_id=? AND field=? AND state IN('pending','conflicted') AND source_sequence<?",
            [
              canonical({ by: contributionId, at: now }),
              env.SCHOOL_ID,
              item.staffId,
              item.field,
              proof.sequence,
            ],
          ),
          w(
            "INSERT INTO contacts_contributions(school_id,contribution_id,staff_id,field,value_json,base_revision,source_publication,source_sequence,source_json,proposal_json,decision_id,proposer,created_at,state) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM contacts_contributions WHERE school_id=? AND staff_id=? AND field=? AND source_sequence>?) THEN 'superseded' ELSE 'pending' END",
            [
              env.SCHOOL_ID,
              contributionId,
              item.staffId,
              item.field,
              canonical(item.proposedValue),
              item.acceptedBaseFieldRevision,
              intent.publicationId,
              proof.sequence,
              canonical(source),
              canonical(item),
              proof.decisionId,
              original.principal.actorId,
              now,
              env.SCHOOL_ID,
              item.staffId,
              item.field,
              proof.sequence,
            ],
          ),
        );
        outbox.push({
          id: `process-${await digest(contributionId)}`,
          type: "contacts.contribution",
          payload: { contributionId },
        });
        statuses.push({
          contributionId,
          staffId: item.staffId,
          field: item.field,
          state: "pending",
        });
      }
      return commitOperation(env.DB, op, {
        now,
        admission: {
          kind: "system",
          reason: "verified immutable Deploy publication contribution delivery",
        },
        writes,
        outbox,
        result: {
          state: "pending",
          count: proposed.length,
          publicationId: intent.publicationId,
          contributions: statuses,
        },
        audit: {
          sourceDecisionId: proof.decisionId,
          sourceOperationId: body.sourceOperationId,
        },
      });
    }
    if (path === "/internal/authority") {
      const proof = await serviceCall(env, "core", "/internal/session-proof", {
        sessionToken: body.sessionToken,
      });
      fail(
        proof.schoolId === env.SCHOOL_ID &&
          (proof.staffId === body.query?.staffId || proof.admin),
        "SERVICE_DENIED",
        403,
        "The session cannot read this authority record.",
      );
      return currentSnapshot(env, body.query, now);
    }
    if (path === "/internal/projection") {
      const { principal: p } = await inspectDecision(env, body.decisionId, {
        schoolId: env.SCHOOL_ID,
      });
      return projection(env, body, p, now);
    }
    if (path === "/internal/pins/acquire") {
      if (body.scope?.startsWith("catalogue:"))
        return acquireSourcePin(
          env,
          body,
          {
            sql: "SELECT COALESCE(CAST(MAX(revision) AS TEXT),'0')=? FROM contacts_catalogues WHERE school_id=? AND catalogue_id=?",
            args: [String(body.revision), env.SCHOOL_ID, body.scope.slice(10)],
          },
          now,
        );
      const id = body.scope?.startsWith("staff:") ? body.scope.slice(6) : null;
      fail(validId(id));
      return acquireSourcePin(
        env,
        body,
        {
          sql: "SELECT EXISTS(SELECT 1 FROM contacts_staff WHERE school_id=? AND staff_id=? AND CAST(revision AS TEXT)=?)",
          args: [env.SCHOOL_ID, id, String(body.revision)],
        },
        now,
      );
    }
    if (path === "/internal/pins/release")
      return releaseSourcePin(env, body, now);
    if (path === "/internal/historical") {
      const { principal: p } = await inspectDecision(env, body.decisionId, {
        schoolId: env.SCHOOL_ID,
      });
      fail(
        canManage(p) || p.capabilities.includes("core.admin"),
        "CAPABILITY_DENIED",
        403,
      );
      const r = await one(
        env.DB,
        "SELECT body,digest FROM contacts_snapshots WHERE school_id=? AND snapshot_id=?",
        [env.SCHOOL_ID, body.snapshotId],
      );
      fail(r, "NOT_FOUND", 404);
      return {
        schemaVersion: 1,
        kind: "historical",
        snapshot: JSON.parse(r.body),
        contentDigest: r.digest,
      };
    }
    throw new ApiError(
      "NOT_FOUND",
      404,
      "Unknown internal Contacts operation.",
    );
  }
  if (path === "/save-signature-settings") return saveSignatureSettings(ctx);
  if (path === "/recovery-status") return recoveryStatus(ctx);
  if (path === "/recover-save") return recoverSave(ctx);
  if (path === "/recalculate-data") {
    const result = await recalculate(ctx);
    return {
      ...result,
      data: await handle({ ...ctx, method: "GET", path: "/data", body: {} }),
      directory: await handle({
        ...ctx,
        method: "GET",
        path: "/bootstrap",
        body: {},
      }),
    };
  }
  if (path === "/contributions" && method === "GET")
    return listContributions(ctx);
  if (path === "/contributions/resolve") return resolveContribution(ctx);
  if (path === "/save-receipt") return gridReceipt(ctx);
  if (["/save-data", "/save-diy"].includes(path) && Array.isArray(body.changes))
    return saveGrid(ctx);
  if (path === "/diy")
    return {
      rows: [
        publicStaff(
          await staffRecord(env.DB, env.SCHOOL_ID, principal.staffId),
          now,
          { privateFields: true },
        ),
      ],
      editable: true,
    };
  if (path === "/projection") return projection(env, body, principal, now);
  if (
    ["/bootstrap", "/data", "/deployment", "/staff"].includes(path) &&
    method === "GET"
  ) {
    const rows = (await allRows(env, now)).map((r) =>
      publicStaff(r, now, {
        privateFields:
          canManage(principal) || r.staff.staff_id === principal.staffId,
        directory: true,
      }),
    );
    const revision =
      (
        await one(
          env.DB,
          "SELECT revision FROM contacts_epoch WHERE school_id=?",
          [env.SCHOOL_ID],
        )
      )?.revision ?? 0;
    if (path === "/staff") return { rows, revision };
    if (path === "/deployment") {
      fail(env.DEPLOY_CONTACTS?.read, "DEPENDENCY_UNAVAILABLE", 503);
      return env.DEPLOY_CONTACTS.read({ schoolId: env.SCHOOL_ID });
    }
    return {
      user: {
        capabilities: principal.capabilities,
        email: principal.email,
        staffId: principal.staffId,
        admin: principal.capabilities.includes("admin"),
        powerUser: canManage(principal),
      },
      people: rows,
      rows,
      groups: [],
      access: { read: true, write: canManage(principal) },
      signatureSettings: await signatureSettings(env),
      catalogueRevision: revision,
      revision,
      fields: ["basicName", "ttbName", "mobile", "email"],
      lists: {},
    };
  }
  if (method === "GET" && /^\/staff\/[^/]+$/.test(path)) {
    const id = decodeURIComponent(path.split("/")[2]);
    return publicStaff(await staffRecord(env.DB, env.SCHOOL_ID, id), now, {
      privateFields: canManage(principal) || principal.staffId === id,
    });
  }
  if (path === "/readiness" && method === "GET") return readiness(env, now);
  if (path === "/readiness/check") {
    const report = body.report;
    fail(report?.schoolId === env.SCHOOL_ID, "SCHOOL_MISMATCH", 403);
    const unsigned = { ...report };
    delete unsigned.proof;
    fail(
      typeof report.proof === "string" &&
        (await secureEqual(await readinessProof(env, unsigned), report.proof)),
      "READINESS_INVALID",
      400,
      "Readiness evidence was changed.",
    );
    const epoch =
      (
        await one(
          env.DB,
          "SELECT revision FROM contacts_epoch WHERE school_id=?",
          [env.SCHOOL_ID],
        )
      )?.revision ?? 0;
    const ready =
      report.state === "ready" &&
      report.epoch === epoch &&
      report.validUntil > now;
    return {
      ready,
      state: ready ? "ready" : "invalidated",
      epoch,
      reason:
        report.epoch !== epoch
          ? "READINESS_CHANGED"
          : report.validUntil <= now
            ? "READINESS_EXPIRED"
            : report.state !== "ready"
              ? "READINESS_BLOCKED"
              : null,
    };
  }
  if (path === "/audit") {
    const rows = await query(
      env.DB,
      "SELECT staff_id AS staffId,field,proposer,accepter,accepted_at AS acceptedAt,operation_id AS operationId,before_json,after_json FROM contacts_acceptance_audit WHERE school_id=? ORDER BY accepted_at DESC LIMIT 500",
      [env.SCHOOL_ID],
    );
    return { rows };
  }
  if (path === "/catalogues" && method === "GET") {
    return {
      rows: (
        await query(
          env.DB,
          "SELECT c.* FROM contacts_catalogues c JOIN(SELECT catalogue_id,MAX(revision) revision FROM contacts_catalogues WHERE school_id=? GROUP BY catalogue_id) h ON c.catalogue_id=h.catalogue_id AND c.revision=h.revision WHERE c.school_id=?",
          [env.SCHOOL_ID, env.SCHOOL_ID],
        )
      ).map((r) => JSON.parse(r.body)),
    };
  }
  if (path === "/health")
    return {
      schemaVersion: 1,
      service: "contacts",
      retentionDeletionEnabled: false,
      staffCount: (
        await one(
          env.DB,
          "SELECT COUNT(*) n FROM contacts_staff WHERE school_id=?",
          [env.SCHOOL_ID],
        )
      ).n,
      heldPins: (
        await one(
          env.DB,
          "SELECT COUNT(*) n FROM source_pins WHERE school_id=? AND state='held'",
          [env.SCHOOL_ID],
        )
      ).n,
    };
  if (path === "/catalogues" && method === "POST") return saveCatalogue(ctx);
  const create = path === "/staff/create",
    self = path === "/save-diy",
    match = path.match(/^\/staff\/([^/]+)\/(update|accept|propose)$/);
  if (create || self || match || path === "/save-data") {
    const staffId = create
      ? (body.staffId ??
        `staff-${await digest([env.SCHOOL_ID, body.operationId])}`)
      : (body.staffId ?? decodeURIComponent(match?.[1] ?? ""));
    fail(validId(staffId));
    if (match && body.staffId)
      fail(
        body.staffId === decodeURIComponent(match[1]),
        "STAFF_MISMATCH",
        403,
      );
    if (self)
      fail(
        staffId === principal.staffId,
        "CAPABILITY_DENIED",
        403,
        "Only your own profile can be edited.",
      );
    else
      fail(
        canManage(principal) ||
          principal.capabilities.includes("contacts.mobile") ||
          (create && principal.capabilities.includes("contacts.provisional")) ||
          (principal.capabilities.includes("contacts.contribute") &&
            principal.fieldScope.staffId === staffId),
        "CAPABILITY_DENIED",
        403,
      );
    const accepted = match?.[2] === "accept",
      propose = match?.[2] === "propose";
    const changes = create
      ? {
          basicName: body.basicName,
          ttbName: body.ttbName ?? body.basicName,
          ...(body.mobile ? { mobile: body.mobile } : {}),
          ...Object.fromEntries(
            ["nameSuffix", "employmentTags", "subjectTags", "mkTags"]
              .filter((k) => body[k] !== undefined)
              .map((k) => [k, body[k]]),
          ),
        }
      : accepted || propose
        ? { [body.field]: body.value }
        : body.changes;
    fail(
      changes &&
        typeof changes === "object" &&
        !Array.isArray(changes) &&
        Object.keys(changes).length >= 1 &&
        Object.keys(changes).length <= 8,
    );
    if (self)
      fail(
        Object.keys(changes).every((f) => SELF_FIELDS.includes(f)),
        "CAPABILITY_DENIED",
        403,
      );
    if (principal.capabilities.includes("contacts.mobile"))
      fail(
        Object.keys(changes).length === 1 && Object.hasOwn(changes, "mobile"),
        "CAPABILITY_DENIED",
        403,
      );
    if (principal.capabilities.includes("contacts.contribute"))
      fail(
        Object.keys(changes).every((f) =>
          principal.fieldScope.fields.includes(f),
        ),
        "CAPABILITY_DENIED",
        403,
      );
    if (!accepted && !propose)
      fail(
        !Object.keys(changes).some((f) => AUTHORITY.includes(f)),
        "AUTHORITY_ACCEPTANCE_REQUIRED",
        400,
        "Use explicit authority acceptance.",
      );
    if (accepted) {
      fail(AUTHORITY.includes(body.field));
      fail(
        principal.actorStaffId && principal.actorStaffId !== staffId,
        "SELF_ACCEPTANCE_DENIED",
        403,
        "A different linked Contacts manager must accept this record.",
      );
      fail(
        typeof body.ownerReviewReference === "string" &&
          body.ownerReviewReference.length > 0 &&
          body.ownerReviewReference.length <= 160,
        "OWNER_REVIEW_REQUIRED",
        400,
        "Record the owner review reference.",
      );
    }
    for (const [field, value] of Object.entries(changes))
      validateValue(field, value);
    const from = body.validFrom ?? now,
      until = body.validUntil ?? null;
    fail(
      Number.isSafeInteger(from) &&
        from >= 0 &&
        (until === null || (Number.isSafeInteger(until) && until > from)),
    );
    const action = principal.capabilities.includes("contacts.mobile")
        ? "contacts.mobile"
        : principal.capabilities.includes("contacts.contribute")
          ? "contacts.contribute"
          : principal.capabilities.includes("contacts.provisional")
            ? "contacts.provisional"
            : self
              ? "contacts.self"
              : "contacts.manage",
      op = await prepareOperation(env.DB, {
        schoolId: env.SCHOOL_ID,
        actorId: principal.actorId,
        operationId: body.operationId,
        action,
        intent: body,
        now,
        validUntil: principal.validUntil,
        authorization: principal,
      });
    if (op.receipt) return op.receipt;
    const admission = await admit(env, env.DB, op, principal, [], now);
    if (propose) {
      const old = await staffRecord(env.DB, env.SCHOOL_ID, staffId);
      const result = {
        state: "pending",
        staffId,
        contributionId: op.operationId,
      };
      const r = await commitOperation(env.DB, op, {
        now,
        admission,
        writes: [
          w(
            "INSERT INTO contacts_contributions(school_id,contribution_id,staff_id,field,value_json,base_revision,source_publication,decision_id,proposer,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            [
              env.SCHOOL_ID,
              op.operationId,
              staffId,
              body.field,
              canonical(body.value),
              body.revision ?? old.fields[body.field]?.revision ?? 0,
              body.sourcePublicationId ?? null,
              principal.decisionId,
              principal.actorId,
              now,
            ],
          ),
        ],
        result,
      });
      await resolveAdmission(env, env.DB, op, admission, r, now);
      return r;
    }
    const scope = `staff:${staffId}`;
    let held = await queueSourceChange(
      env.DB,
      env.SCHOOL_ID,
      scope,
      op.operationId,
      now,
      env.SERVICE_NAME,
    );
    if (held.length) {
      await requestSourceCancellations(env, held);
      held = await queueSourceChange(
        env.DB,
        env.SCHOOL_ID,
        scope,
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
      };
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = create
        ? {
            staff: {
              staff_id: staffId,
              basic_name: body.basicName,
              ttb_name: body.ttbName ?? body.basicName,
              revision: 0,
              authority_revision: 0,
              active: null,
              section: null,
              profile_state: "provisional",
            },
            fields: {},
          }
        : await staffRecord(env.DB, env.SCHOOL_ID, staffId);
      if (create) {
        const existing = await one(
          env.DB,
          "SELECT staff_id FROM contacts_staff WHERE school_id=? AND staff_id=?",
          [env.SCHOOL_ID, staffId],
        );
        fail(
          !existing,
          "IDENTITY_SELECTION_REQUIRED",
          409,
          "Select the existing active, inactive or provisional person, or provide a distinct name tag.",
        );
      }
      const nextFields = { ...current.fields },
        writes = [],
        guards = [
          sourceChangeGuard(
            env.SCHOOL_ID,
            scope,
            op.operationId,
            env.SERVICE_NAME,
          ),
        ];
      const expected = accepted ? body.revision : (body.fieldRevisions ?? {});
      if (!create && !accepted && body.revision !== undefined)
        guards.push(
          w(
            "SELECT EXISTS(SELECT 1 FROM contacts_staff WHERE school_id=? AND staff_id=? AND revision=?) AS ok",
            [env.SCHOOL_ID, staffId, body.revision],
          ),
        );
      for (const [field, value] of Object.entries(changes)) {
        const old = current.fields[field],
          expectedField = accepted
            ? expected
            : (expected[field] ?? (create ? 0 : (old?.revision ?? 0)));
        fail(Number.isSafeInteger(expectedField) && expectedField >= 0);
        guards.push(
          w(
            "SELECT COALESCE((SELECT revision FROM contacts_fields WHERE school_id=? AND staff_id=? AND field=?),0)=? AS ok",
            [env.SCHOOL_ID, staffId, field, expectedField],
          ),
        );
        const change = replaceField(
            old,
            field,
            value,
            {
              schoolId: env.SCHOOL_ID,
              staffId,
              actorId: principal.actorId,
              operationId: op.operationId,
              now,
            },
            from,
            until,
          ),
          row = change.row;
        nextFields[field] = row;
        writes.push(...change.writes);
        if (accepted)
          writes.push(
            w(
              "INSERT INTO contacts_acceptance_audit(school_id,event_id,staff_id,field,proposer,accepter,accepted_at,operation_id,before_json,after_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
              [
                env.SCHOOL_ID,
                `${op.operationId}:${field}`,
                staffId,
                field,
                principal.actorId,
                principal.actorId,
                now,
                op.operationId,
                old ? canonical(record(old)) : null,
                canonical({
                  ...record(row),
                  ownerReviewReference: body.ownerReviewReference,
                  decisionId: principal.decisionId,
                }),
              ],
            ),
          );
      }
      await validateAssignments(
        env.DB,
        env.SCHOOL_ID,
        nextFields,
        current.fields,
      );
      writes.push(
        ...(await deriveDisplay(env.DB, env.SCHOOL_ID, nextFields, {
          schoolId: env.SCHOOL_ID,
          staffId,
          actorId: principal.actorId,
          operationId: op.operationId,
          now,
        })),
      );
      validateMkeIntervals(nextFields);
      // Structural dependent-group check includes future records, so future MKE+SMC cannot be pre-authorised.
      const section = sectionCode(
        nextFields.schoolSection
          ? JSON.parse(nextFields.schoolSection.value_json)
          : current.staff.section,
      );
      const smc = nextFields.smc && JSON.parse(nextFields.smc.value_json);

      const revision = current.staff.revision + 1,
        active = effectiveField(nextFields.employmentActive, now),
        name =
          effectiveField(nextFields.basicName, now) ?? current.staff.basic_name,
        ttb = effectiveField(nextFields.ttbName, now) ?? current.staff.ttb_name;
      guards.push(
        create
          ? w(
              "SELECT NOT EXISTS(SELECT 1 FROM contacts_staff WHERE school_id=? AND staff_id=?) AS ok",
              [env.SCHOOL_ID, staffId],
            )
          : w(
              "SELECT EXISTS(SELECT 1 FROM contacts_staff WHERE school_id=? AND staff_id=? AND revision=?) AS ok",
              [env.SCHOOL_ID, staffId, current.staff.revision],
            ),
      );
      if (create)
        writes.unshift(
          w(
            "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,active,section,revision,authority_revision,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            [
              env.SCHOOL_ID,
              staffId,
              name,
              ttb,
              active === null ? null : active ? 1 : 0,
              section ?? null,
              revision,
              accepted ? 1 : 0,
              now,
            ],
          ),
        );
      else
        writes.push(
          w(
            "UPDATE contacts_staff SET basic_name=?,ttb_name=?,active=?,section=?,revision=?,authority_revision=authority_revision+?,profile_state=? WHERE school_id=? AND staff_id=?",
            [
              name,
              ttb,
              active === null ? null : active ? 1 : 0,
              section ?? null,
              revision,
              accepted ? 1 : 0,
              effectiveField(nextFields.profileState, now) ??
                current.staff.profile_state,
              env.SCHOOL_ID,
              staffId,
            ],
          ),
        );
      if (body.contributionId) {
        guards.push(
          w(
            "SELECT EXISTS(SELECT 1 FROM contacts_contributions WHERE school_id=? AND contribution_id=? AND staff_id=? AND state IN('pending','conflicted')) AS ok",
            [env.SCHOOL_ID, body.contributionId, staffId],
          ),
        );
        writes.push(
          w(
            "UPDATE contacts_contributions SET state='applied',outcome_json=? WHERE school_id=? AND contribution_id=?",
            [
              canonical({
                accepter: principal.actorId,
                operationId: op.operationId,
                at: now,
              }),
              env.SCHOOL_ID,
              body.contributionId,
            ],
          ),
        );
      }
      writes.push(
        ...(await makeSnapshots(
          env.DB,
          env.SCHOOL_ID,
          staffId,
          revision,
          nextFields,
        )),
        w(
          "INSERT INTO contacts_epoch(school_id,revision) VALUES(?,1) ON CONFLICT(school_id) DO UPDATE SET revision=revision+1",
          [env.SCHOOL_ID],
        ),
        sourceChangeDone(env.SCHOOL_ID, scope, op.operationId),
      );
      try {
        const r = await commitOperation(env.DB, op, {
          now,
          admission,
          guards,
          writes,
          result: {
            staffId,
            revision,
            fieldRevisions: Object.fromEntries(
              Object.entries(nextFields).map(([k, v]) => [k, v.revision]),
            ),
            state: "applied",
          },
          outbox: birthdayIntents(
            env.SCHOOL_ID,
            op.operationId,
            Object.keys(changes),
            now,
            from,
            until,
          ),
          audit: {
            staffId,
            fields: Object.keys(changes),
            ownerReviewReference: body.ownerReviewReference ?? null,
          },
        });
        await resolveAdmission(env, env.DB, op, admission, r, now);
        return r;
      } catch (e) {
        if (
          e.code !== "REVISION_CONFLICT" ||
          attempt === 2 ||
          create ||
          (body.revision !== undefined && !accepted)
        )
          throw e;
      }
    }
  }
  throw new ApiError("NOT_FOUND", 404, "Unknown Contacts operation.");
}

export async function scheduled(ctx) {
  return dispatchContactsJobs(ctx);
}
