import { check, isRecord } from "./validation.mjs";

export const HR_CHOICE_FIELDS = Object.freeze([
  "Day of Birth", "Month of birth", "Role", "EO Appt Level",
  "Appointment Status", "Employment Modifier", "Subject Modifier", "Active", "MK Modifier",
]);
const fixedChoices = Object.freeze({
  "Day of Birth": Array.from({ length: 31 }, (_, index) => String(index + 1)),
  "Month of birth": Array.from({ length: 12 }, (_, index) => String(index + 1)),
  Active: ["Y", "N"],
});
export const EDITABLE_HR_CHOICE_FIELDS = Object.freeze(
  HR_CHOICE_FIELDS.filter((field) => field !== "Role" && !Object.hasOwn(fixedChoices, field)),
);

function list(value, field, limit = 150) {
  check(Array.isArray(value) && value.length <= limit, `Use at most ${limit} choices for ${field}.`);
  const values = value.map((entry) => {
    check(typeof entry === "string" && entry.length <= 160 && entry.trim().length > 0 &&
      !/[\x00-\x1f\x7f]/.test(entry), `Use nonblank text choices for ${field}.`);
    return entry.trim();
  });
  check(new Set(values).size === values.length, `Use unique choices for ${field}.`);
  return values;
}

/** Internal dropdown definitions never assign staff facts or accepted authority. */
export function choiceLists(doc) {
  const configured = doc.hrChoicesSchema === 1;
  const source = configured ? doc.hrChoices : doc.masterOptions || doc.hrTerms || {};
  check(!configured || isRecord(source), "Stored HR choices are invalid.");
  if (configured) {
    check(Object.keys(source).length === EDITABLE_HR_CHOICE_FIELDS.length &&
      Object.keys(source).every((field) => EDITABLE_HR_CHOICE_FIELDS.includes(field)), "Stored HR choice fields are invalid.");
    for (const field of EDITABLE_HR_CHOICE_FIELDS) list(source[field], field);
  }
  const result = {};
  for (const field of HR_CHOICE_FIELDS) {
    if (Object.hasOwn(fixedChoices, field)) result[field] = [...fixedChoices[field]];
    else if (field === "Role" && doc.roleMembershipSchema === 1)
      result[field] = (doc.membership || []).map((row) => row[0]).filter((role) => role !== "");
    else if (field === "Role") result[field] = [...(doc.masterOptions?.Role || doc.hrTerms?.Role || [])];
    else result[field] = Array.isArray(source?.[field]) ? [...source[field]] : [];
  }
  return result;
}

/** Validate a complete editor payload, including its read-only columns. */
export function normalizeHRChoices(value, doc, { derivedRole = false } = {}) {
  check(isRecord(value) && Object.keys(value).length === HR_CHOICE_FIELDS.length &&
    Object.keys(value).every((field) => HR_CHOICE_FIELDS.includes(field)), "Supply the exact HR choice fields.");
  const current = choiceLists(doc), result = {};
  for (const field of HR_CHOICE_FIELDS) {
    result[field] = list(value[field], field, field === "Role" ? 300 : 150);
    // A native queued edit can precede a later coalesced matrix edit. Its Role
    // cell is display-only; the matrix, never this payload, remains authoritative.
    if (field === "Role" && derivedRole) {
      result[field] = [...current.Role];
      continue;
    }
    if (!EDITABLE_HR_CHOICE_FIELDS.includes(field))
      check(JSON.stringify(result[field]) === JSON.stringify(current[field]),
        field === "Role" ? "Edit roles in Membership." : `${field} uses fixed choices.`);
  }
  return result;
}

/** Maintain the copied UI's compatibility aliases from one version-owned source. */
export function applyCatalogueLinks(doc) {
  const choices = choiceLists(doc);
  doc.masterOptions = structuredClone(choices);
  doc.hrTerms = structuredClone(choices);
  return doc;
}
