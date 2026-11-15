import { ApiError } from "../../runtime/errors.mjs";
import { query, one, canonical, digest } from "../../runtime/store.mjs";
import {
  GROUPS,
  PROFILES,
  FIELDS,
  fieldNames,
  fieldVector,
  validateFields,
  choose,
} from "../../contacts/contracts.mjs";
import { validateCatalogues } from "../../contacts/catalogues.mjs";
import {
  isDirectField,
  normalizeDirectValue,
  encodeDirectValue,
  decodeStoredValue,
} from "../../contacts/direct-fields.mjs";
const fail = (
  v,
  c = "INVALID_INPUT",
  s = 400,
  m = "Check the supplied staff fields.",
) => {
  if (!v) throw new ApiError(c, s, m);
};
export const AUTHORITY = ["smc", "eo", "schoolLeader"];
export const SELF_FIELDS = ["mobile", "statutoryName"];
export const DATA_FIELDS = [
  ...Object.keys(FIELDS),
  "mobile",
  "email",
  "iconEmail",
  "cesEmail",
  "ext",
  "birthday",
  "statutoryName",
  "aliases",
  "signature",
  "preferredName",
  "nameSuffix",
];
export function record(row) {
  return row
    ? row.state === "accepted"
      ? {
          state: "accepted",
          revision: `${row.field}-${row.revision}`,
          ...decodeStoredValue(row.field, JSON.parse(row.value_json)),
          validFrom: row.valid_from,
          validUntil: row.valid_until,
          revoked: !!row.revoked,
        }
      : { state: row.state }
    : { state: "missing" };
}
export function records(row) {
  return row?.timeline_json ? JSON.parse(row.timeline_json) : [record(row)];
}
export async function staffRecord(db, schoolId, staffId) {
  const staff = await one(
    db,
    "SELECT * FROM contacts_staff WHERE school_id=? AND staff_id=?",
    [schoolId, staffId],
  );
  fail(staff, "NOT_FOUND", 404, "Staff record was not found.");
  const fields = await query(
    db,
    "SELECT * FROM contacts_fields WHERE school_id=? AND staff_id=?",
    [schoolId, staffId],
  );
  return { staff, fields: Object.fromEntries(fields.map((f) => [f.field, f])) };
}
export function publicStaff(
  { staff, fields },
  now,
  { privateFields = false, directory = false } = {},
) {
  const projected = {};
  for (const [name, row] of Object.entries(fields)) {
    if (
      !privateFields &&
      ([
        "birthday",
        "statutoryName",
        "aliases",
        "signature",
        "smc",
        "eo",
        "schoolLeader",
      ].includes(name) ||
        (!directory &&
          ["mobile", "email", "iconEmail", "cesEmail"].includes(name)))
    )
      continue;
    const timeline = records(row),
      p = choose(timeline, now),
      r =
        timeline.find(
          (r) =>
            r.state === "accepted" &&
            !r.revoked &&
            r.validFrom <= now &&
            (r.validUntil === null || r.validUntil > now),
        ) ?? record(row);
    projected[name] = {
      ...r,
      revision: row.revision,
      effective: p.state === "effective",
      ...(timeline.length > 1 ? { timeline } : {}),
    };
  }
  return {
    staffId: staff.staff_id,
    id: staff.staff_id,
    name: effectiveField(fields.basicName, now) ?? staff.basic_name,
    basicName: effectiveField(fields.basicName, now) ?? staff.basic_name,
    ttbName: effectiveField(fields.ttbName, now) ?? staff.ttb_name,
    revision: staff.revision,
    authorityRevision: staff.authority_revision,
    active: effectiveField(fields.employmentActive, now),
    schoolSection: effectiveField(fields.schoolSection, now),
    profileState: staff.profile_state,
    fields: projected,
  };
}
export function effectiveField(row, now) {
  const matching = records(row).filter(
    (r) =>
      r.state === "accepted" &&
      !r.revoked &&
      r.validFrom <= now &&
      (r.validUntil === null || r.validUntil > now),
  );
  return matching.length === 1 ? matching[0].value : null;
}
export function validateValue(field, value) {
  fail(DATA_FIELDS.includes(field));
  if (
    value === null &&
    ![...AUTHORITY, "basicName", "ttbName", "profileState"].includes(field)
  )
    return;
  if (isDirectField(field)) {
    try {
      normalizeDirectValue(field, value);
    } catch (error) {
      throw new ApiError(
        "INVALID_DIRECT_FIELD",
        400,
        `${field}: ${error.message}`,
        { field },
      );
    }
  } else if (FIELDS[field] === "boolean") fail(typeof value === "boolean");
  else if (field === "profileState")
    fail(["provisional", "complete"].includes(value));
  else if (FIELDS[field] === "text")
    fail(
      typeof value === "string" &&
        value.trim().length > 0 &&
        value.length <= 160 &&
        !/[\x00-\x1f]/.test(value),
    );
  else if (FIELDS[field]) {
    const refs = FIELDS[field].endsWith("[]") ? value : [value];
    fail(Array.isArray(refs) && refs.length <= 32);
    for (const ref of refs)
      fail(
        ref &&
          typeof ref === "object" &&
          Object.keys(ref).sort().join(",") === "catalogueId,code,revision" &&
          [ref.catalogueId, ref.code, ref.revision].every(
            (v) =>
              typeof v === "string" &&
              /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(v),
          ),
      );
  } else if (["statutoryName", "preferredName"].includes(field))
    fail(
      typeof value === "string" &&
        value.trim().length > 0 &&
        value.length <= 160 &&
        !/[\x00-\x1f\x7f]/.test(value),
    );
  else if (field === "nameSuffix")
    fail(
      typeof value === "string" &&
        value.length <= 40 &&
        !/[()\x00-\x1f]/.test(value),
    );
  else if (field === "mobile")
    fail(typeof value === "string" && /^\+?[0-9 ()-]{7,24}$/.test(value));
  else if (["email", "iconEmail", "cesEmail"].includes(field))
    fail(
      typeof value === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
        value.length <= 320,
    );
  else if (field === "birthday") {
    fail(
      typeof value === "string" &&
        /^(?:[0-9]{4}-)?(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/.test(
          value,
        ),
    );
    const parts = value.split("-").map(Number),
      day = parts.at(-1),
      month = parts.at(-2),
      year = parts.length === 3 ? parts[0] : 2000;
    fail(
      year >= 1 &&
        new Date(
          Date.UTC(year < 100 ? year + 400 : year, month, 0),
        ).getUTCDate() >= day,
    );
  } else if (field === "aliases")
    fail(
      Array.isArray(value) &&
        value.length <= 16 &&
        value.every(
          (v) =>
            typeof v === "string" &&
            v.trim().length > 0 &&
            v.length <= 160 &&
            !/[\x00-\x1f\x7f]/.test(v),
        ),
    );
  else fail(typeof value === "string" && value.length <= 4096);
}
export function storageValue(field, value, legacy = null) {
  return isDirectField(field) ? encodeDirectValue(field, value, legacy) : value;
}
export function sectionCode(value) {
  return typeof value === "object" && value ? value.code : value;
}
export async function makeSnapshots(
  db,
  schoolId,
  staffId,
  revision,
  fields,
  overrides = [],
) {
  const writes = [];
  for (const profile of Object.keys(PROFILES)) {
    const allValues = Object.fromEntries(
      fieldNames(profile).map((name) => [name, records(fields[name])]),
    );
    const schemaVersion =
      profile === "staff" &&
      Object.values(allValues).some((rows) =>
        rows.some((r) => r.valueSchema === 2),
      )
        ? 2
        : 1;
    validateFields(allValues, profile, { schemaVersion });
    // Precompute immutable authority phases on a content mutation. Reads select a
    // stored phase; they never allocate revisions or mutate source content.
    const phases =
      profile === "authority"
        ? [
            ...new Set([
              0,
              ...Object.values(allValues).flatMap((rs) =>
                rs
                  .filter((r) => r.state === "accepted")
                  .flatMap((r) =>
                    [r.validFrom, r.validUntil].filter((t) => t !== null),
                  ),
              ),
            ]),
          ].sort((a, b) => a - b)
        : [0];
    for (let phase = 0; phase < phases.length; phase++) {
      const at = phases[phase],
        values =
          profile === "authority"
            ? Object.fromEntries(
                Object.entries(allValues).map(([name, rows]) => {
                  const accepted = rows
                      .filter((r) => r.state === "accepted")
                      .sort((a, b) => a.validFrom - b.validFrom),
                    current = accepted.find(
                      (r) =>
                        !r.revoked &&
                        r.validFrom <= at &&
                        (r.validUntil === null || r.validUntil > at),
                    ),
                    past = accepted.filter((r) => r.validFrom <= at).at(-1);
                  return [name, [current ?? past ?? accepted[0] ?? rows[0]]];
                }),
              )
            : allValues;

      const refs = new Map();
      for (const rows of Object.values(values))
        for (const r of rows)
          if (r.state === "accepted") {
            const values = Array.isArray(r.value) ? r.value : [r.value];
            for (const v of values)
              if (v && typeof v === "object" && v.catalogueId)
                refs.set(`${v.catalogueId}/${v.revision}`, {
                  catalogueId: v.catalogueId,
                  revision: v.revision,
                });
          }
      const catalogues = [];
      for (const ref of refs.values()) {
        const override = overrides.find(
            (c) =>
              c.catalogueId === ref.catalogueId && c.revision === ref.revision,
          ),
          row = override
            ? { body: JSON.stringify(override) }
            : await one(
                db,
                "SELECT body FROM contacts_catalogues WHERE school_id=? AND catalogue_id=? AND CAST(revision AS TEXT)=?",
                [schoolId, ref.catalogueId, ref.revision],
              );
        fail(
          row,
          "REFERENCE_MISMATCH",
          400,
          "An accepted catalogue reference is unavailable.",
        );
        catalogues.push(JSON.parse(row.body));
      }
      // A role may reference EO appointment catalogue evidence transitively.
      for (const c of [...catalogues])
        for (const e of c.entries)
          if (c.kind === "membership-role" && e.eoAppointment) {
            const ref = e.eoAppointment,
              key = `${ref.catalogueId}/${ref.revision}`;
            if (!refs.has(key)) {
              const override = overrides.find(
                  (c) =>
                    c.catalogueId === ref.catalogueId &&
                    c.revision === ref.revision,
                ),
                row = override
                  ? { body: JSON.stringify(override) }
                  : await one(
                      db,
                      "SELECT body FROM contacts_catalogues WHERE school_id=? AND catalogue_id=? AND CAST(revision AS TEXT)=?",
                      [schoolId, ref.catalogueId, ref.revision],
                    );
              fail(row, "REFERENCE_MISMATCH", 400);
              refs.set(key, {
                catalogueId: ref.catalogueId,
                revision: ref.revision,
              });
              catalogues.push(JSON.parse(row.body));
            }
          }
      validateCatalogues(
        catalogues,
        Object.fromEntries(
          Object.entries(values).map(([name, rows]) => [
            name,
            rows.filter((r) => r.valueSchema !== 2),
          ]),
        ),
        [...refs.values()],
      );
      const snapshot = {
        schemaVersion,
        source: "contacts",
        schoolId,
        staffId,
        profile,
        snapshotId: `${staffId}-${profile}-${revision}-${phase}`,
        revision: `source-${staffId}-${revision}-${phase}`,
        sequence: revision * 1000 + phase,
        fields: values,
        groups: Object.fromEntries(
          PROFILES[profile].map((g) => [
            g,
            {
              revision: `${g}-${staffId}-${revision}-${phase}`,
              vector: fieldVector(values, GROUPS[g]),
            },
          ]),
        ),
        dependencies: {
          complete: true,
          definitions:
            profile === "authority"
              ? [
                  {
                    groupId: "authority-records",
                    definitionRevision: "authority-records-v1",
                    revision: `authority-${staffId}-${revision}-${phase}`,
                    members: AUTHORITY,
                    vector: fieldVector(values, AUTHORITY),
                  },
                ]
              : [],
        },
        catalogueRefs: [...refs.values()],
        catalogues,
      };
      const hash = await digest(snapshot);
      writes.push({
        sql: "INSERT INTO contacts_snapshots(school_id,staff_id,profile,snapshot_id,revision,sequence,staff_revision,valid_from,valid_until,digest,body) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        args: [
          schoolId,
          staffId,
          profile,
          snapshot.snapshotId,
          snapshot.revision,
          snapshot.sequence,
          revision,
          at,
          phases[phase + 1] ?? null,
          hash,
          canonical(snapshot),
        ],
      });
    }
  }
  return writes;
}
export async function currentSnapshot(env, q, now) {
  fail(q?.schoolId === env.SCHOOL_ID, "SCHOOL_MISMATCH", 403);
  fail(
    ["authority", "staff", "display"].includes(q.profile) &&
      typeof q.evaluationId === "string" &&
      Number.isSafeInteger(q.requestedAt),
  );
  const row = await one(
    env.DB,
    "SELECT s.body,p.revision,p.active,p.staff_id,f.state,f.value_json,f.timeline_json,f.valid_from,f.valid_until,f.revoked,f.field,f.revision AS active_revision FROM contacts_staff p LEFT JOIN contacts_fields f ON f.school_id=p.school_id AND f.staff_id=p.staff_id AND f.field='employmentActive' JOIN contacts_snapshots s ON s.school_id=p.school_id AND s.staff_id=p.staff_id AND s.staff_revision=p.revision AND s.profile=? AND s.valid_from<=? AND (s.valid_until IS NULL OR s.valid_until>?) WHERE p.school_id=? AND p.staff_id=?",
    [q.profile, now, now, env.SCHOOL_ID, q.staffId],
  );
  fail(
    row,
    "AUTHORITY_UNAVAILABLE",
    503,
    "Immutable Contacts evidence is unavailable.",
  );
  return {
    read: {
      schemaVersion: 1,
      kind: "current",
      observation: {
        evaluationId: q.evaluationId,
        requestedAt: q.requestedAt,
        asOf: now,
      },
      snapshot: JSON.parse(row.body),
    },
    staffRevision: row.revision,
    active:
      effectiveField(
        row.field ? { ...row, revision: row.active_revision } : null,
        now,
      ) === true,
    eligibility: {
      employmentActive: records(
        row.field ? { ...row, revision: row.active_revision } : null,
      ).find(
        (r) =>
          r.state === "accepted" &&
          !r.revoked &&
          r.validFrom <= now &&
          (r.validUntil === null || r.validUntil > now),
      ) ?? { state: "missing" },
      employmentActiveTimeline: records(
        row.field ? { ...row, revision: row.active_revision } : null,
      ),
      sourceRevision: row.revision,
    },
  };
}
