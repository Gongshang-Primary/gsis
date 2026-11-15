/** Direct Contacts values. This module owns no storage, transport or authority. */
export const DIRECT_VALUE_SCHEMA = 2;
export const DIRECT_FIELDS = Object.freeze([
  "schoolSection",
  "personnelCategory",
  "employmentArrangement",
  "employmentStatus",
  "role",
  "appointmentStatus",
  "eoAppointmentLevel",
  "memberships",
  "employmentTags",
  "subjectTags",
  "mkTags",
]);
const many = new Set([
  "memberships",
  "employmentTags",
  "subjectTags",
  "mkTags",
]);
const tokenPattern = "^[^\\u0000-\\u001f\\u007f,;]{1,160}$";
const tokenExpression = new RegExp(tokenPattern);
export const DIRECT_FIELD_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    DIRECT_FIELDS.map((field) => [
      field,
      Object.freeze({
        type: many.has(field) ? "string[]" : "string",
        maxLength: 160,
        pattern: tokenPattern,
        ...(many.has(field) ? { maxItems: 32 } : {}),
        nullable: true,
        ...(field === "schoolSection"
          ? { choices: Object.freeze(["Primary", "MK", "MKE"]) }
          : {}),
      }),
    ]),
  ),
);
export const isDirectField = (field) => DIRECT_FIELDS.includes(field);
const plain = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, required, optional = []) =>
  plain(value) &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => required.includes(key) || optional.includes(key),
  );
const identifier = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(value);
const hash = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function invalid(
  field,
  message = "Use a bounded direct value for this field.",
) {
  throw Object.assign(new Error(message), {
    code: "INVALID_DIRECT_FIELD",
    field,
  });
}
function token(field, value) {
  if (typeof value !== "string") invalid(field);
  const trimmed = value.trim();
  if (!tokenExpression.test(trimmed))
    invalid(
      field,
      "Use 1–160 characters without control characters, commas or semicolons.",
    );
  return trimmed;
}
export function normalizeDirectValue(field, input) {
  if (!isDirectField(field)) invalid(field);
  if (
    input === null ||
    (!many.has(field) && typeof input === "string" && !input.trim())
  )
    return null;
  if (many.has(field)) {
    if (!Array.isArray(input) || input.length > 32)
      invalid(field, "Use an ordered list of at most 32 values.");
    return [...new Set(input.map((value) => token(field, value)))];
  }
  const value = token(field, input);
  if (
    field === "schoolSection" &&
    !DIRECT_FIELD_DEFINITIONS[field].choices.includes(value)
  )
    invalid(field, "Choose Primary, MK or MKE for school section.");
  return value;
}
function validateLegacy(field, legacy, value) {
  if (
    !exact(legacy, ["sourceFieldRevision", "sourceRecordDigest", "items"]) ||
    !identifier(legacy.sourceFieldRevision) ||
    !hash(legacy.sourceRecordDigest) ||
    !Array.isArray(legacy.items) ||
    legacy.items.length > 32
  )
    invalid(field, "The retained field provenance is invalid.");
  const values = many.has(field) ? value : [value],
    seen = new Set();
  for (const item of legacy.items) {
    if (
      !exact(
        item,
        [
          "index",
          "catalogueId",
          "catalogueRevision",
          "code",
          "definitionRevision",
          "catalogueDigest",
          "label",
          "active",
        ],
        ["ttbVisible", "order"],
      ) ||
      !Number.isSafeInteger(item.index) ||
      item.index < 0 ||
      item.index >= values.length ||
      seen.has(item.index) ||
      item.code !== values[item.index] ||
      ![
        item.catalogueId,
        item.catalogueRevision,
        item.code,
        item.definitionRevision,
      ].every(identifier) ||
      !hash(item.catalogueDigest) ||
      typeof item.label !== "string" ||
      !item.label ||
      item.label.length > 160 ||
      /[\u0000-\u001f\u007f]/.test(item.label) ||
      typeof item.active !== "boolean"
    )
      invalid(field, "The retained field provenance is invalid.");
    if (field.endsWith("Tags")) {
      if (
        typeof item.ttbVisible !== "boolean" ||
        !Number.isSafeInteger(item.order) ||
        item.order < 0 ||
        item.order > 10000
      )
        invalid(field);
    } else if (
      Object.hasOwn(item, "ttbVisible") ||
      Object.hasOwn(item, "order")
    )
      invalid(field);
    seen.add(item.index);
  }
}
function validatedValue(field, value, legacy) {
  if (!isDirectField(field) || value === null) invalid(field);
  let clean;
  if (field === "schoolSection" && legacy) clean = token(field, value);
  else clean = normalizeDirectValue(field, value);
  if (clean === null || JSON.stringify(clean) !== JSON.stringify(value))
    invalid(field, "Stored direct values must already be normalized.");
  if (legacy) validateLegacy(field, legacy, value);
  return clean;
}
export function encodeDirectValue(field, value, legacy = null) {
  const clean = legacy ? value : normalizeDirectValue(field, value);
  validatedValue(field, clean, legacy);
  return {
    schemaVersion: 2,
    value: structuredClone(clean),
    ...(legacy ? { legacy: structuredClone(legacy) } : {}),
  };
}
export function decodeStoredValue(field, value) {
  if (plain(value) && Object.hasOwn(value, "schemaVersion")) {
    if (
      !exact(value, ["schemaVersion", "value"], ["legacy"]) ||
      value.schemaVersion !== 2
    )
      invalid(field, "Unsupported Contacts value version.");
    validatedValue(field, value.value, value.legacy);
    return {
      value: structuredClone(value.value),
      valueSchema: 2,
      ...(value.legacy ? { legacy: structuredClone(value.legacy) } : {}),
    };
  }
  return { value };
}
export function validateDirectRecord(field, record) {
  if (record.valueSchema !== 2) invalid(field);
  validatedValue(field, record.value, record.legacy);
}
export function resolveLegacyValue(
  field,
  value,
  { sourceFieldRevision, sourceRecordDigest, definitions } = {},
) {
  if (
    !isDirectField(field) ||
    !identifier(sourceFieldRevision) ||
    !hash(sourceRecordDigest) ||
    !Array.isArray(definitions) ||
    definitions.length > 128
  )
    invalid(field);
  const refs = many.has(field) ? value : [value];
  if (!Array.isArray(refs) || refs.length > 32) invalid(field);
  const items = refs.map((ref, index) => {
    if (
      !exact(ref, ["catalogueId", "revision", "code"]) ||
      ![ref.catalogueId, ref.revision, ref.code].every(identifier)
    )
      invalid(field, "The legacy reference is malformed.");
    const matches = definitions.filter(
      ({ catalogue }) =>
        catalogue?.catalogueId === ref.catalogueId &&
        catalogue.revision === ref.revision,
    );
    if (matches.length !== 1 || !hash(matches[0].digest))
      invalid(
        field,
        "The exact pinned definition is unavailable or ambiguous.",
      );
    const { catalogue, digest } = matches[0],
      entries = catalogue.entries?.filter((entry) => entry.code === ref.code);
    const kind = field.endsWith("Tags")
      ? "operational-tag"
      : ["role", "memberships"].includes(field)
        ? "membership-role"
        : "hr-term";
    if (
      catalogue.kind !== kind ||
      entries?.length !== 1 ||
      (kind !== "membership-role" && entries[0].category !== field)
    )
      invalid(field, "The pinned definition does not match this field.");
    const entry = entries[0];
    return {
      index,
      catalogueId: ref.catalogueId,
      catalogueRevision: ref.revision,
      code: ref.code,
      definitionRevision: entry.definitionRevision,
      catalogueDigest: digest,
      label: entry.label,
      active: entry.active,
      ...(kind === "operational-tag"
        ? { ttbVisible: entry.ttbVisible, order: entry.order }
        : {}),
    };
  });
  const direct = many.has(field)
    ? items.map((item) => item.code)
    : items[0]?.code;
  const legacy = { sourceFieldRevision, sourceRecordDigest, items };
  validatedValue(field, direct, legacy);
  return { value: direct, legacy };
}
export function directPresentation(field, record) {
  if (!record || record.state !== "accepted")
    return { available: false, value: null, items: [], legacy: false };
  if (record.valueSchema !== 2)
    return { available: false, value: record.value, items: [], legacy: false };
  validateDirectRecord(field, record);
  const values = many.has(field) ? record.value : [record.value];
  return {
    available: true,
    value: structuredClone(record.value),
    legacy: !!record.legacy,
    items: values.map((value, index) => {
      const prior = record.legacy?.items.find((item) => item.index === index);
      return {
        value,
        label: prior?.label ?? value,
        visible:
          prior?.ttbVisible ??
          !["primary", "eo", "full-time", "full time", "specialist"].includes(
            value.toLowerCase(),
          ),
        order: prior?.order ?? index,
      };
    }),
  };
}
/** Self-contained so the build adapter can embed this exact owner display rule. */
export function previewTTb(profile, presentation = {}) {
  if (
    !profile ||
    typeof profile.basicName !== "string" ||
    !profile.basicName.trim()
  )
    return { available: false, reason: "BASIC_NAME_MISSING" };
  if (profile.subjectTags != null && !Array.isArray(profile.subjectTags))
    return { available: false, reason: "FIELD_EVIDENCE_UNAVAILABLE" };
  const requiredSubjectTags =
    ["MTL", "PE", "Art", "Music"].includes(profile.role) &&
    !(profile.subjectTags ?? []).includes(profile.role)
      ? [profile.role]
      : [];
  const tags = [],
    seen = new Set();
  for (const field of ["employmentTags", "subjectTags", "mkTags"]) {
    const supplied = profile[field] ?? [];
    if (
      !Array.isArray(supplied) ||
      supplied.some((value) => typeof value !== "string")
    )
      return { available: false, reason: "FIELD_EVIDENCE_UNAVAILABLE" };
    const retained = presentation[field];
    if (
      retained &&
      (retained.available === false || !Array.isArray(retained.items))
    )
      return { available: false, reason: "FIELD_EVIDENCE_UNAVAILABLE" };
    const values =
      field === "subjectTags"
        ? [...supplied, ...requiredSubjectTags]
        : supplied;
    const items = values.map((value, index) => {
      const old = retained?.items.find((item) => item.value === value);
      return {
        value,
        label: old?.label ?? value,
        visible:
          old?.visible ??
          !["primary", "eo", "full-time", "full time", "specialist"].includes(
            value.toLowerCase(),
          ),
        order: old?.order ?? index,
        index,
      };
    });
    if (retained?.legacy)
      items.sort((a, b) => a.order - b.order || a.index - b.index);
    for (const item of items) {
      if (!item.visible || seen.has(item.value) || seen.has(item.label))
        continue;
      tags.push(item.label);
      seen.add(item.value);
      seen.add(item.label);
    }
  }
  const suffix = profile.nameSuffix;
  if (suffix !== undefined && suffix !== null && typeof suffix !== "string")
    return { available: false, reason: "FIELD_EVIDENCE_UNAVAILABLE" };
  if (suffix && !seen.has(suffix)) tags.push(suffix);
  const name =
    profile.basicName.trim() + tags.map((value) => ` (${value})`).join("");
  if (name.length > 160)
    return { available: false, reason: "TTB_NAME_TOO_LONG" };
  return { available: true, name, requiredSubjectTags };
}
