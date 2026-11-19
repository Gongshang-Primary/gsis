/* Immutable Deploy HR Terms catalogue publication snapshot builder (DEP-17-001). */
import { EDITABLE_HR_CHOICE_FIELDS, choiceLists } from "./catalogue-links.mjs";

const FIXED_FIELDS = new Set(["Day of Birth", "Month of birth", "Active"]);
const PUBLISHABLE_FIELDS = new Set([...EDITABLE_HR_CHOICE_FIELDS, "Role"]);

/**
 * Capture version-owned HR Terms choices into the immutable publication envelope.
 * Preserves explicit empty arrays ([]) separately from absent/unconfigured fields.
 * Never includes fixed lists (Day of Birth, Month of birth, Active).
 */
export function buildHrTermsPublication(doc) {
  const configured = doc?.hrChoicesSchema === 1;
  const rawSource = configured
    ? doc.hrChoices || {}
    : doc?.masterOptions || doc?.hrTerms || {};
  const resolved = choiceLists(doc || {});
  const lists = {};
  const absentFields = [];

  for (const field of PUBLISHABLE_FIELDS) {
    if (FIXED_FIELDS.has(field)) continue;
    if (field === "Role") {
      if (doc?.roleMembershipSchema === 1) {
        lists.Role = [...(resolved.Role || [])];
      } else if (Object.prototype.hasOwnProperty.call(rawSource, "Role") && Array.isArray(rawSource.Role)) {
        lists.Role = [...resolved.Role];
      } else {
        absentFields.push("Role");
      }
      continue;
    }
    if (
      configured ||
      (Object.prototype.hasOwnProperty.call(rawSource, field) &&
        Array.isArray(rawSource[field]))
    ) {
      lists[field] = [...(resolved[field] || [])];
    } else {
      absentFields.push(field);
    }
  }

  return {
    schemaVersion: 1,
    configured,
    lists,
    absentFields: absentFields.sort(),
  };
}
