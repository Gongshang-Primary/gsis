import { ApiError } from "../../runtime/errors.mjs";
import { canonical, digest, query } from "../../runtime/store.mjs";
import { choose } from "../../contacts/contracts.mjs";
import {
  isDirectField,
  resolveLegacyValue,
  directPresentation,
  previewTTb,
} from "../../contacts/direct-fields.mjs";
import { record, records, effectiveField, storageValue } from "./store.mjs";
import { replaceField } from "./intervals.mjs";
const w = (sql, args) => ({ sql, args });
const fail = (
  ok,
  code = "REFERENCE_MISMATCH",
  status = 409,
  message = "The pinned Contacts evidence is unavailable.",
) => {
  if (!ok) throw new ApiError(code, status, message);
};
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

/** Load only exact immutable definitions used by the supplied records. No current catalogue lookup. */
export async function pinnedDefinitions(db, schoolId, fieldsList) {
  const refs = new Map();
  for (const fields of fieldsList)
    for (const [field, row] of Object.entries(fields)) {
      if (!isDirectField(field)) continue;
      const values =
        row && Object.hasOwn(row, "value_json") ? records(row) : [row];
      for (const r of values) {
        if (r?.state !== "accepted" || r.valueSchema === 2) continue;
        for (const ref of Array.isArray(r.value) ? r.value : [r.value])
          if (
            ref &&
            typeof ref === "object" &&
            typeof ref.catalogueId === "string" &&
            typeof ref.revision === "string"
          )
            refs.set(canonical([ref.catalogueId, ref.revision]), {
              id: ref.catalogueId,
              revision: ref.revision,
            });
      }
    }
  fail(refs.size <= 512, "REFERENCE_BOUNDS", 413);
  if (!refs.size) return [];
  const result = [],
    loaded = new Set();
  let bytes = 0;
  for (let round = 0; round < 2; round++) {
    const pending = [...refs].filter(([key]) => !loaded.has(key));
    if (!pending.length) break;
    pending.forEach(([key]) => loaded.add(key));
    const rows = await query(
      db,
      "SELECT c.body FROM contacts_catalogues c JOIN json_each(?) r ON c.catalogue_id=json_extract(r.value,'$.id') AND CAST(c.revision AS TEXT)=json_extract(r.value,'$.revision') WHERE c.school_id=?",
      [canonical(pending.map(([, value]) => value)), schoolId],
    );
    bytes += new TextEncoder().encode(canonical(rows)).length;
    fail(bytes < 1024 * 1024, "REFERENCE_BOUNDS", 413);
    for (const row of rows) {
      let catalogue;
      try {
        catalogue = JSON.parse(row.body);
      } catch {
        continue;
      }
      if (
        !catalogue ||
        typeof catalogue !== "object" ||
        !Array.isArray(catalogue.entries)
      )
        continue;
      result.push({ catalogue, digest: await digest(catalogue) });
      if (catalogue.kind === "membership-role")
        for (const entry of catalogue.entries ?? []) {
          const ref = entry.eoAppointment;
          if (
            ref &&
            typeof ref.catalogueId === "string" &&
            typeof ref.revision === "string"
          )
            refs.set(canonical([ref.catalogueId, ref.revision]), {
              id: ref.catalogueId,
              revision: ref.revision,
            });
        }
    }
    fail(refs.size <= 512, "REFERENCE_BOUNDS", 413);
  }
  return result;
}
export async function resolvedField(field, r, definitions) {
  if (!r || r.state !== "accepted") return r ?? { state: "missing" };
  if (r.valueSchema === 2 || !isDirectField(field)) return r;
  const resolved = resolveLegacyValue(field, r.value, {
    sourceFieldRevision: String(r.revision),
    sourceRecordDigest: await digest(r),
    definitions: definitions.filter(({ catalogue }) =>
      (Array.isArray(r.value) ? r.value : [r.value]).some(
        (ref) =>
          ref?.catalogueId === catalogue?.catalogueId &&
          ref?.revision === catalogue?.revision,
      ),
    ),
  });
  return { ...r, ...resolved, valueSchema: 2 };
}
export async function validateAssignments(
  db,
  schoolId,
  fields,
  prior,
  suppliedDefinitions,
) {
  const changed = Object.fromEntries(
    Object.entries(fields).filter(
      ([field, row]) => isDirectField(field) && row !== prior[field],
    ),
  );
  const definitions =
    suppliedDefinitions ?? (await pinnedDefinitions(db, schoolId, [changed]));
  for (const [field, row] of Object.entries(changed))
    for (const r of records(row)) await resolvedField(field, r, definitions);
}
/** Explicit optional clear supersedes the value; future clears retain the preceding interval. */
export function writeOrdinaryField(
  old,
  field,
  value,
  context,
  from = context.now,
  until = null,
) {
  if (value !== null) {
    const selected = choose(records(old), from),
      prior = selected.state === "effective" ? selected.record : null;
    const legacy =
      isDirectField(field) &&
      prior?.valueSchema === 2 &&
      canonical(prior.value) === canonical(value)
        ? prior.legacy
        : null;
    return replaceField(
      old,
      field,
      storageValue(field, value, legacy),
      context,
      from,
      until,
    );
  }
  let revision = old?.revision ?? 0;
  const timeline = [],
    history = [];
  if (from > context.now)
    for (const prior of records(old)) {
      if (
        prior.state !== "accepted" ||
        prior.validFrom >= from ||
        (prior.validUntil !== null && prior.validUntil <= context.now)
      )
        continue;
      const next =
        prior.validUntil === null || prior.validUntil > from
          ? { ...prior, revision: `${field}-${++revision}`, validUntil: from }
          : prior;
      timeline.push(next);
      if (next !== prior) history.push(next);
    }
  const row = {
    school_id: context.schoolId,
    staff_id: context.staffId,
    field,
    revision: ++revision,
    state: "superseded",
    value_json: null,
    valid_from: from,
    valid_until: until,
    revoked: 0,
    proposer: context.actorId,
    accepter: context.actorId,
    accepted_at: context.now,
    operation_id: context.operationId,
  };
  fail(timeline.length < 8, "INTERVAL_BOUNDS", 409);
  timeline.push({ state: "superseded" });
  row.timeline_json = canonical(timeline);
  return {
    row,
    writes: [
      fieldWrite(row),
      w(
        "UPDATE contacts_fields SET timeline_json=? WHERE school_id=? AND staff_id=? AND field=?",
        [row.timeline_json, context.schoolId, context.staffId, field],
      ),
      ...history.map((r) =>
        w(
          "INSERT INTO contacts_history(school_id,staff_id,field,revision,record_json) VALUES(?,?,?,?,?)",
          [
            context.schoolId,
            context.staffId,
            field,
            Number(r.revision.slice(field.length + 1)),
            canonical(r),
          ],
        ),
      ),
      w(
        "INSERT INTO contacts_history(school_id,staff_id,field,revision,record_json) VALUES(?,?,?,?,?)",
        [
          context.schoolId,
          context.staffId,
          field,
          row.revision,
          canonical(record(row)),
        ],
      ),
    ],
  };
}
function timelineWrite(fields, field, timeline, revision, context) {
  fail(timeline.length <= 8, "INTERVAL_BOUNDS", 409);
  const latest = timeline.at(-1),
    row = {
      school_id: context.schoolId,
      staff_id: context.staffId,
      field,
      revision,
      state: "accepted",
      value_json: canonical(storageValue(field, latest.value, latest.legacy)),
      valid_from: latest.validFrom,
      valid_until: latest.validUntil,
      revoked: 0,
      proposer: context.actorId,
      accepter: context.actorId,
      accepted_at: context.now,
      operation_id: context.operationId,
      timeline_json: canonical(timeline),
    };
  fields[field] = row;
  return [
    fieldWrite(row),
    w(
      "UPDATE contacts_fields SET timeline_json=? WHERE school_id=? AND staff_id=? AND field=?",
      [row.timeline_json, context.schoolId, context.staffId, field],
    ),
    ...timeline.map((r) =>
      w(
        "INSERT INTO contacts_history(school_id,staff_id,field,revision,record_json) VALUES(?,?,?,?,?)",
        [
          context.schoolId,
          context.staffId,
          field,
          Number(r.revision.slice(field.length + 1)),
          canonical(r),
        ],
      ),
    ),
  ];
}
/** Derive display with pinned legacy presentation and the four existing subject requirements. */
export async function deriveDisplay(
  db,
  schoolId,
  fields,
  context,
  suppliedDefinitions,
) {
  const definitions =
      suppliedDefinitions ?? (await pinnedDefinitions(db, schoolId, [fields])),
    writes = [];
  const moments = [
    ...new Set([
      context.now,
      ...[
        "basicName",
        "nameSuffix",
        "role",
        "employmentTags",
        "subjectTags",
        "mkTags",
      ].flatMap((field) =>
        records(fields[field])
          .filter((r) => r.state === "accepted")
          .flatMap((r) =>
            [r.validFrom, r.validUntil].filter(
              (t) => t !== null && t > context.now,
            ),
          ),
      ),
    ]),
  ].sort((a, b) => a - b);
  const subjects = [],
    names = [];
  let subjectRevision = fields.subjectTags?.revision ?? 0,
    nameRevision = fields.ttbName?.revision ?? 0,
    subjectChanged = false;
  for (let i = 0; i < moments.length; i++) {
    const at = moments[i],
      until = moments[i + 1] ?? null,
      profile = {
        basicName: effectiveField(fields.basicName, at),
        nameSuffix: effectiveField(fields.nameSuffix, at),
      },
      presentation = {};
    for (const field of ["role", "employmentTags", "subjectTags", "mkTags"]) {
      const selected = choose(records(fields[field]), at),
        r =
          selected.state === "effective"
            ? await resolvedField(field, selected.record, definitions)
            : { state: "missing" };
      profile[field] = r.state === "accepted" ? r.value : null;
      if (r.state === "accepted")
        presentation[field] = directPresentation(field, r);
    }
    if (!profile.basicName) continue;
    const preview = previewTTb(profile, presentation);
    if (preview.reason === "TTB_NAME_TOO_LONG")
      throw new ApiError(
        "TTB_NAME_TOO_LONG",
        400,
        "The derived TTb Name exceeds 160 characters. Shorten the display modifiers or name suffix.",
      );
    fail(preview.available, "DISPLAY_EVIDENCE_UNAVAILABLE", 409);
    const currentSubjects = profile.subjectTags ?? [],
      missing = (preview.requiredSubjectTags ?? []).filter(
        (tag) => !currentSubjects.includes(tag),
      );
    if (missing.length) subjectChanged = true;
    // A later role-derived tag must not fabricate an accepted empty record now.
    if (profile.subjectTags !== null || missing.length) {
      const subjectValue = [...currentSubjects, ...missing];
      const selectedSource = choose(records(fields.subjectTags), at);
      const source =
        selectedSource.state === "effective" ? selectedSource.record : null;
      const resolved =
        source?.state === "accepted"
          ? await resolvedField("subjectTags", source, definitions)
          : null;
      const nextSubject = {
        state: "accepted",
        revision: `subjectTags-${++subjectRevision}`,
        value: subjectValue,
        valueSchema: 2,
        ...(resolved?.legacy ? { legacy: resolved.legacy } : {}),
        validFrom: at,
        validUntil: until,
        revoked: false,
      };
      const previous = subjects.at(-1);
      if (
        previous &&
        previous.validUntil === at &&
        canonical(previous.value) === canonical(nextSubject.value) &&
        canonical(previous.legacy ?? null) ===
          canonical(nextSubject.legacy ?? null)
      )
        previous.validUntil = until;
      else subjects.push(nextSubject);
    }
    const priorName = names.at(-1);
    if (priorName?.value === preview.name) priorName.validUntil = until;
    else
      names.push({
        state: "accepted",
        revision: `ttbName-${++nameRevision}`,
        value: preview.name,
        validFrom: at,
        validUntil: until,
        revoked: false,
      });
  }
  if (subjectChanged)
    writes.push(
      ...timelineWrite(
        fields,
        "subjectTags",
        subjects,
        subjectRevision,
        context,
      ),
    );
  const previous = records(fields.ttbName).filter(
    (r) =>
      r.state === "accepted" &&
      (r.validUntil === null || r.validUntil > context.now),
  );
  const same =
    names.length === previous.length &&
    names.every(
      (r, i) =>
        r.value === previous[i].value &&
        r.validUntil === previous[i].validUntil &&
        (i === 0 || r.validFrom === previous[i].validFrom),
    );
  if (names.length && !same)
    writes.push(
      ...timelineWrite(fields, "ttbName", names, nameRevision, context),
    );
  return writes;
}
