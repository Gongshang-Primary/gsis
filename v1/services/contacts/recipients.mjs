import { ApiError } from "../../runtime/errors.mjs";
import { query } from "../../runtime/store.mjs";
import { effectiveField, records } from "./store.mjs";
/** Narrow named CoreRecipientProjection binding: no directory/email/birthday output. */
export async function recipientStaff(env, input, now = Date.now()) {
  if (input.schoolId !== env.SCHOOL_ID || typeof input.staffId !== "string")
    throw new ApiError("SCHOOL_MISMATCH", 403);
  const rows = await query(
    env.DB,
    "SELECT p.staff_id,p.revision,f.field,f.revision field_revision,f.state,f.value_json,f.timeline_json,f.valid_from,f.valid_until,f.revoked FROM contacts_staff p LEFT JOIN contacts_fields f ON f.school_id=p.school_id AND f.staff_id=p.staff_id AND f.field IN('mobile','employmentActive') WHERE p.school_id=? AND p.staff_id=?",
    [env.SCHOOL_ID, input.staffId],
  );
  if (!rows.length) throw new ApiError("STAFF_NOT_FOUND", 404);
  const fields = Object.fromEntries(
      rows
        .filter((x) => x.field)
        .map((x) => [x.field, { ...x, revision: x.field_revision }]),
    ),
    transitions = rows.flatMap((x) =>
      records(x)
        .filter((r) => r.state === "accepted")
        .flatMap((r) =>
          [r.validFrom, r.validUntil].filter((t) => t !== null && t > now),
        ),
    );
  return {
    staffId: input.staffId,
    revision: rows[0].revision,
    active: effectiveField(fields.employmentActive, now),
    mobile: effectiveField(fields.mobile, now),
    validUntil: transitions.length ? Math.min(...transitions) : null,
    fieldRevisions: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v.revision]),
    ),
    observation: { evaluationId: crypto.randomUUID(), asOf: now },
  };
}
function phone(value, country) {
  if (typeof value !== "string") return null;
  let n = value.replace(/\D/g, "");
  if (n.length === 8) n = country + n;
  return n;
}
export async function recipientMobile(env, input, now = Date.now()) {
  if (input.schoolId !== env.SCHOOL_ID)
    throw new ApiError("SCHOOL_MISMATCH", 403);
  const target = phone(input.mobile, env.PHONE_COUNTRY_CODE ?? "65");
  if (!target) throw new ApiError("RECIPIENT_UNMATCHED", 403);
  const rows = await query(
    env.DB,
    "SELECT * FROM contacts_fields WHERE school_id=? AND field='mobile' LIMIT 513",
    [env.SCHOOL_ID],
  );
  if (rows.length > 512) throw new ApiError("PROJECTION_BOUNDS", 413);
  const matches = rows.filter(
    (r) =>
      phone(effectiveField(r, now), env.PHONE_COUNTRY_CODE ?? "65") === target,
  );
  if (matches.length !== 1)
    return { state: matches.length ? "ambiguous" : "missing" };
  const result = await recipientStaff(
    env,
    { schoolId: env.SCHOOL_ID, staffId: matches[0].staff_id },
    now,
  );
  delete result.mobile;
  return { ...result, state: "unique" };
}
