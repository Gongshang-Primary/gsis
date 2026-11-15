import { ApiError } from "../../runtime/errors.mjs";
import {
  canonical,
  one,
  query,
  prepareOperation,
  commitOperation,
} from "../../runtime/store.mjs";
import {
  admit,
  resolveAdmission,
  queueSourceChange,
  requestSourceCancellations,
  sourceChangeGuard,
  sourceChangeDone,
} from "../../runtime/admission.mjs";
import { validateCatalogues } from "../../contacts/catalogues.mjs";
import { FIELDS } from "../../contacts/contracts.mjs";
import {
  record,
  records,
  staffRecord,
  effectiveField,
  makeSnapshots,
} from "./store.mjs";
const w = (sql, args) => ({ sql, args });
const fail = (
  ok,
  code = "CATALOGUE_INVALID",
  status = 400,
  message = "Check the catalogue definition.",
) => {
  if (!ok) throw new ApiError(code, status, message);
};
export async function currentCatalogues(db, schoolId) {
  return (
    await query(
      db,
      "SELECT c.body FROM contacts_catalogues c JOIN(SELECT catalogue_id,MAX(revision) revision FROM contacts_catalogues WHERE school_id=? GROUP BY catalogue_id) h ON c.catalogue_id=h.catalogue_id AND c.revision=h.revision WHERE c.school_id=?",
      [schoolId, schoolId],
    )
  ).map((r) => JSON.parse(r.body));
}
export function fieldWrite(row) {
  const columns = [
    "school_id",
    "staff_id",
    "field",
    "revision",
    "state",
    "value_json",
    "valid_from",
    "valid_until",
    "revoked",
    "proposer",
    "accepter",
    "accepted_at",
    "operation_id",
  ];
  return w(
    "INSERT INTO contacts_fields(" +
      columns.join(",") +
      ") VALUES(" +
      columns.map(() => "?").join(",") +
      ") ON CONFLICT(school_id,staff_id,field) DO UPDATE SET " +
      columns
        .slice(3)
        .map((k) => `${k}=excluded.${k}`)
        .join(",") +
      ",timeline_json=NULL",
    columns.map((k) => row[k]),
  );
}
export function changedField(
  fields,
  field,
  value,
  { schoolId, staffId, actorId, operationId, now },
) {
  const row = {
    school_id: schoolId,
    staff_id: staffId,
    field,
    revision: (fields[field]?.revision ?? 0) + 1,
    state: "accepted",
    value_json: canonical(value),
    valid_from: now,
    valid_until: null,
    revoked: 0,
    proposer: actorId,
    accepter: actorId,
    accepted_at: now,
    operation_id: operationId,
  };
  fields[field] = row;
  return [
    fieldWrite(row),
    w(
      "INSERT INTO contacts_history(school_id,staff_id,field,revision,record_json) VALUES(?,?,?,?,?)",
      [schoolId, staffId, field, row.revision, canonical(record(row))],
    ),
  ];
}
async function catalogueFor(db, schoolId, ref, overrides) {
  const c = overrides.find(
    (c) => c.catalogueId === ref.catalogueId && c.revision === ref.revision,
  );
  if (c) return c;
  const row = await one(
    db,
    "SELECT body FROM contacts_catalogues WHERE school_id=? AND catalogue_id=? AND CAST(revision AS TEXT)=?",
    [schoolId, ref.catalogueId, ref.revision],
  );
  fail(row, "REFERENCE_MISMATCH");
  return JSON.parse(row.body);
}
export async function validateAssignments(
  db,
  schoolId,
  fields,
  prior,
  overrides = [],
) {
  for (const [field, row] of Object.entries(fields)) {
    if (
      !FIELDS[field] ||
      ![
        "hr-term",
        "membership-role",
        "membership-role[]",
        "operational-tag[]",
      ].includes(FIELDS[field]) ||
      row.state !== "accepted"
    )
      continue;
    const refs = JSON.parse(row.value_json),
      old =
        prior[field]?.state === "accepted"
          ? JSON.parse(prior[field].value_json)
          : [];
    const existing = Array.isArray(old) ? old : [old];
    for (const ref of Array.isArray(refs) ? refs : [refs]) {
      const c = await catalogueFor(db, schoolId, ref, overrides),
        entry = c.entries.find((e) => e.code === ref.code);
      fail(entry, "REFERENCE_MISMATCH");
      fail(
        entry.active ||
          existing.some(
            (r) => r.catalogueId === ref.catalogueId && r.code === ref.code,
          ),
        "TAG_RETIRED",
        409,
        "Retired values cannot be newly assigned.",
      );
    }
  }
}
/** Derive display and the four approved role-implied subject tags from controlled codes only. */
export async function deriveDisplay(
  db,
  schoolId,
  fields,
  context,
  overrides = [],
) {
  const writes = [],
    now = context.now;
  const roleMoments = [
    ...new Set([
      now,
      ...["role", "subjectTags"].flatMap((f) =>
        records(fields[f])
          .filter((r) => r.state === "accepted")
          .flatMap((r) =>
            [r.validFrom, r.validUntil].filter((t) => t !== null && t > now),
          ),
      ),
    ]),
  ].sort((a, b) => a - b);
  const subjectTimeline = [];
  let subjectRevision = fields.subjectTags?.revision ?? 0,
    changed = false,
    definitions;
  for (let i = 0; i < roleMoments.length; i++) {
    const at = roleMoments[i],
      role = effectiveField(fields.role, at),
      tags = [...(effectiveField(fields.subjectTags, at) ?? [])];
    if (
      role &&
      ["MTL", "PE", "Art", "Music"].includes(role.code) &&
      !tags.some((t) => t.code === role.code)
    ) {
      definitions ??= [
        ...(await currentCatalogues(db, schoolId)),
        ...overrides,
      ];
      const matches = definitions.flatMap((c) =>
          c.kind === "operational-tag"
            ? c.entries
                .filter(
                  (e) =>
                    e.active &&
                    e.category === "subjectTags" &&
                    e.code === role.code,
                )
                .map((e) => ({
                  catalogueId: c.catalogueId,
                  revision: c.revision,
                  code: e.code,
                }))
            : [],
        ),
        unique = [...new Map(matches.map((r) => [r.catalogueId, r])).values()];
      fail(
        unique.length === 1,
        "CATALOGUE_SELECTION_REQUIRED",
        409,
        "The role requires its corresponding controlled subject tag.",
      );
      tags.push(unique[0]);
      changed = true;
    }
    const previous = subjectTimeline.at(-1);
    if (previous && canonical(previous.value) === canonical(tags))
      previous.validUntil = roleMoments[i + 1] ?? null;
    else
      subjectTimeline.push({
        state: "accepted",
        revision: `subjectTags-${++subjectRevision}`,
        value: tags,
        validFrom: at,
        validUntil: roleMoments[i + 1] ?? null,
        revoked: false,
      });
  }
  if (changed) {
    fail(subjectTimeline.length <= 8, "INTERVAL_BOUNDS", 409);
    const latest = subjectTimeline.at(-1),
      row = {
        school_id: schoolId,
        staff_id: context.staffId,
        field: "subjectTags",
        revision: subjectRevision,
        state: "accepted",
        value_json: canonical(latest.value),
        valid_from: latest.validFrom,
        valid_until: latest.validUntil,
        revoked: 0,
        proposer: context.actorId,
        accepter: context.actorId,
        accepted_at: now,
        operation_id: context.operationId,
        timeline_json: canonical(subjectTimeline),
      };
    fields.subjectTags = row;
    writes.push(
      fieldWrite(row),
      w(
        "UPDATE contacts_fields SET timeline_json=? WHERE school_id=? AND staff_id=? AND field='subjectTags'",
        [row.timeline_json, schoolId, context.staffId],
      ),
      ...subjectTimeline.map((r) =>
        w(
          "INSERT INTO contacts_history(school_id,staff_id,field,revision,record_json) VALUES(?,?,?,?,?)",
          [
            schoolId,
            context.staffId,
            "subjectTags",
            Number(r.revision.slice(12)),
            canonical(r),
          ],
        ),
      ),
    );
  }
  const moments = [
      ...new Set([
        now,
        ...[
          "basicName",
          "nameSuffix",
          "employmentTags",
          "subjectTags",
          "mkTags",
        ].flatMap((f) =>
          records(fields[f])
            .filter((r) => r.state === "accepted")
            .flatMap((r) =>
              [r.validFrom, r.validUntil].filter((t) => t !== null && t > now),
            ),
        ),
      ]),
    ].sort((a, b) => a - b),
    timeline = [];
  let revision = fields.ttbName?.revision ?? 0;
  for (let i = 0; i < moments.length; i++) {
    const at = moments[i],
      tags = [];
    for (const field of ["employmentTags", "subjectTags", "mkTags"]) {
      const values = [];
      for (const ref of effectiveField(fields[field], at) ?? []) {
        const c = await catalogueFor(db, schoolId, ref, overrides),
          e = c.entries.find((e) => e.code === ref.code);
        if (e?.ttbVisible) values.push(e);
      }
      values.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
      for (const e of values)
        if (!tags.some((t) => t.code === e.code || t.label === e.label))
          tags.push(e);
    }
    const basic = effectiveField(fields.basicName, at);
    if (basic === null) continue;
    const suffix = effectiveField(fields.nameSuffix, at),
      value =
        basic +
        tags.map((e) => ` (${e.label})`).join("") +
        (suffix && !tags.some((e) => e.label === suffix || e.code === suffix)
          ? ` (${suffix})`
          : "");
    const previous = timeline.at(-1);
    if (previous?.value === value) {
      previous.validUntil = moments[i + 1] ?? null;
      continue;
    }
    timeline.push({
      state: "accepted",
      revision: `ttbName-${++revision}`,
      value,
      validFrom: at,
      validUntil: moments[i + 1] ?? null,
      revoked: false,
    });
  }
  if (timeline.length > 8)
    throw new ApiError(
      "INTERVAL_BOUNDS",
      409,
      "The display schedule exceeds eight effective intervals.",
    );
  const prior = records(fields.ttbName);
  if (
    timeline.length &&
    !(
      timeline.length === 1 &&
      prior.length === 1 &&
      effectiveField(fields.ttbName, now) === timeline[0].value &&
      prior[0].validUntil === timeline[0].validUntil
    )
  ) {
    const latest = timeline.at(-1),
      row = {
        school_id: schoolId,
        staff_id: context.staffId,
        field: "ttbName",
        revision,
        state: "accepted",
        value_json: canonical(latest.value),
        valid_from: latest.validFrom,
        valid_until: latest.validUntil,
        revoked: 0,
        proposer: context.actorId,
        accepter: context.actorId,
        accepted_at: now,
        operation_id: context.operationId,
        timeline_json: canonical(timeline),
      };
    fields.ttbName = row;
    writes.push(
      fieldWrite(row),
      w(
        "UPDATE contacts_fields SET timeline_json=? WHERE school_id=? AND staff_id=? AND field='ttbName'",
        [row.timeline_json, schoolId, context.staffId],
      ),
      ...timeline.map((r) =>
        w(
          "INSERT INTO contacts_history(school_id,staff_id,field,revision,record_json) VALUES(?,?,?,?,?)",
          [
            schoolId,
            context.staffId,
            "ttbName",
            Number(r.revision.slice(8)),
            canonical(r),
          ],
        ),
      ),
    );
  }
  return writes;
}
export async function saveCatalogue(ctx) {
  const { env, body, principal, now } = ctx,
    c = body.catalogue;
  fail(
    principal.capabilities.includes("admin") ||
      principal.capabilities.includes("contacts.manage"),
    "CAPABILITY_DENIED",
    403,
  );
  fail(
    c &&
      Number.isSafeInteger(body.revision) &&
      body.revision >= 0 &&
      c.revision === String(body.revision + 1),
  );
  const old = await one(
    env.DB,
    "SELECT body FROM contacts_catalogues WHERE school_id=? AND catalogue_id=? AND revision=?",
    [env.SCHOOL_ID, c.catalogueId, body.revision],
  );
  if (old) {
    const before = JSON.parse(old.body);
    fail(c.kind === before.kind, "CATALOGUE_MEANING_CHANGED", 409);
    for (const e of before.entries) {
      const next = c.entries.find((x) => x.code === e.code);
      fail(
        next,
        "CATALOGUE_HISTORY_REQUIRED",
        409,
        "Retire an entry instead of removing its stable code.",
      );
      for (const key of ["category", "flags", "eoAppointment"])
        fail(
          canonical(next[key] ?? null) === canonical(e[key] ?? null),
          "CATALOGUE_MEANING_CHANGED",
          409,
          "A material semantic change requires a new code.",
        );
    }
  }
  const refs = [{ catalogueId: c.catalogueId, revision: c.revision }],
    definitions = [c];
  for (const e of c.entries ?? [])
    if (e.eoAppointment) {
      const ref = e.eoAppointment;
      if (
        !refs.some(
          (r) =>
            r.catalogueId === ref.catalogueId && r.revision === ref.revision,
        )
      ) {
        const target = await catalogueFor(env.DB, env.SCHOOL_ID, ref, []);
        refs.push({ catalogueId: ref.catalogueId, revision: ref.revision });
        definitions.push(target);
      }
    }
  validateCatalogues(definitions, {}, refs);
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
  const catalogueScope = `catalogue:${c.catalogueId}`;
  let cataloguePins = await queueSourceChange(
    env.DB,
    env.SCHOOL_ID,
    catalogueScope,
    op.operationId,
    now,
    "contacts",
  );
  if (cataloguePins.length) {
    await requestSourceCancellations(env, cataloguePins);
    cataloguePins = await queueSourceChange(
      env.DB,
      env.SCHOOL_ID,
      catalogueScope,
      op.operationId,
      now,
      "contacts",
    );
  }
  if (cataloguePins.length)
    return {
      state: "pending",
      operationId: op.operationId,
      reason: "SOURCE_PIN_HELD",
    };
  const referenced = await query(
    env.DB,
    "SELECT DISTINCT staff_id FROM contacts_fields WHERE school_id=? AND state='accepted' AND field IN('role','memberships','employmentTags','subjectTags','mkTags','schoolSection','personnelCategory','employmentArrangement','employmentStatus','appointmentStatus','eoAppointmentLevel') AND EXISTS(SELECT 1 FROM json_tree(value_json) WHERE key='catalogueId' AND value=?)",
    [env.SCHOOL_ID, c.catalogueId],
  );
  fail(referenced.length <= 512, "CATALOGUE_BOUNDS", 413);
  const guards = [
      sourceChangeGuard(
        env.SCHOOL_ID,
        catalogueScope,
        op.operationId,
        "contacts",
      ),
      w(
        "SELECT COALESCE(MAX(revision),0)=? AS ok FROM contacts_catalogues WHERE school_id=? AND catalogue_id=?",
        [body.revision, env.SCHOOL_ID, c.catalogueId],
      ),
    ],
    writes = [
      w(
        "INSERT INTO contacts_catalogues(school_id,catalogue_id,revision,body) VALUES(?,?,?,?)",
        [env.SCHOOL_ID, c.catalogueId, body.revision + 1, canonical(c)],
      ),
    ];
  for (const { staff_id: staffId } of referenced) {
    const scope = `staff:${staffId}`;
    let held = await queueSourceChange(
      env.DB,
      env.SCHOOL_ID,
      scope,
      op.operationId,
      now,
      "contacts",
    );
    if (held.length) {
      await requestSourceCancellations(env, held);
      held = await queueSourceChange(
        env.DB,
        env.SCHOOL_ID,
        scope,
        op.operationId,
        now,
        "contacts",
      );
    }
    if (held.length)
      return {
        state: "pending",
        operationId: op.operationId,
        reason: "SOURCE_PIN_HELD",
      };
    const old = await staffRecord(env.DB, env.SCHOOL_ID, staffId),
      fields = { ...old.fields },
      context = {
        schoolId: env.SCHOOL_ID,
        staffId,
        actorId: principal.actorId,
        operationId: op.operationId,
        now,
      };
    for (const [field, row] of Object.entries(fields)) {
      if (
        row.state !== "accepted" ||
        !FIELDS[field] ||
        !FIELDS[field].includes("-")
      )
        continue;
      const value = JSON.parse(row.value_json),
        items = Array.isArray(value) ? value : [value];
      if (items.some((r) => r?.catalogueId === c.catalogueId)) {
        let rev = row.revision;
        const timeline = records(row).map((r) => {
          if (r.state !== "accepted") return r;
          const list = Array.isArray(r.value) ? r.value : [r.value],
            mapped = list.map((x) =>
              x?.catalogueId === c.catalogueId
                ? { ...x, revision: c.revision }
                : x,
            );
          return {
            ...r,
            revision: `${field}-${++rev}`,
            value: Array.isArray(r.value) ? mapped : mapped[0],
          };
        });
        const latest = timeline.at(-1),
          updated = {
            ...row,
            revision: rev,
            value_json: canonical(latest.value),
            timeline_json: canonical(timeline),
            proposer: principal.actorId,
            accepter: principal.actorId,
            accepted_at: now,
            operation_id: op.operationId,
          };
        fields[field] = updated;
        writes.push(
          fieldWrite(updated),
          w(
            "UPDATE contacts_fields SET timeline_json=? WHERE school_id=? AND staff_id=? AND field=?",
            [updated.timeline_json, env.SCHOOL_ID, staffId, field],
          ),
          ...timeline
            .filter((r) => r.state === "accepted")
            .map((r) =>
              w(
                "INSERT INTO contacts_history(school_id,staff_id,field,revision,record_json) VALUES(?,?,?,?,?)",
                [
                  env.SCHOOL_ID,
                  staffId,
                  field,
                  Number(r.revision.slice(field.length + 1)),
                  canonical(r),
                ],
              ),
            ),
        );
      }
    }
    writes.push(
      ...(await deriveDisplay(env.DB, env.SCHOOL_ID, fields, context, [c])),
    );
    const revision = old.staff.revision + 1;
    guards.push(
      sourceChangeGuard(env.SCHOOL_ID, scope, op.operationId, "contacts"),
      w(
        "SELECT EXISTS(SELECT 1 FROM contacts_staff WHERE school_id=? AND staff_id=? AND revision=?) AS ok",
        [env.SCHOOL_ID, staffId, old.staff.revision],
      ),
    );
    writes.push(
      w(
        "UPDATE contacts_staff SET ttb_name=?,revision=? WHERE school_id=? AND staff_id=?",
        [
          effectiveField(fields.ttbName, now) ?? old.staff.ttb_name,
          revision,
          env.SCHOOL_ID,
          staffId,
        ],
      ),
      ...(await makeSnapshots(
        env.DB,
        env.SCHOOL_ID,
        staffId,
        revision,
        fields,
        [c],
      )),
      sourceChangeDone(env.SCHOOL_ID, scope, op.operationId),
    );
  }
  writes.push(
    sourceChangeDone(env.SCHOOL_ID, catalogueScope, op.operationId),
    w(
      "INSERT INTO contacts_epoch(school_id,revision) VALUES(?,1) ON CONFLICT(school_id) DO UPDATE SET revision=revision+1",
      [env.SCHOOL_ID],
    ),
  );
  const admission = await admit(env, env.DB, op, principal, [], now);
  const receipt = await commitOperation(env.DB, op, {
    now,
    admission,
    guards,
    writes,
    result: {
      catalogueId: c.catalogueId,
      revision: c.revision,
      updatedStaff: referenced.length,
    },
    audit: {
      kind: "catalogue-definition",
      before: old ? JSON.parse(old.body) : null,
      after: c,
    },
  });
  await resolveAdmission(env, env.DB, op, admission, receipt, now);
  return receipt;
}
