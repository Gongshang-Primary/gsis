import { check } from "./validation.mjs";
import { normalizeDirectValue } from "../../contacts/direct-fields.mjs";
import { planningSnapshot } from "../../web/shared/deploy-eligibility.mjs";

export const ROLE_GROUPS = Object.freeze(["SL", "SC", "SMC", "KP", "TL", "SDT", "CMT", "SAT", "Support", "MK"]);
export const ROLE_COLUMNS = Object.freeze(["Role Shortform", "Formal Role Name", ...ROLE_GROUPS, "EO Appt Level", "EO"]);
const roleKey = (value) => String(value ?? "").trim().toLowerCase();
const versionRole = (doc, teacher) => doc.teacherDrafts?.[teacher.id]?.Role ?? planningSnapshot(teacher).Role ?? "";
function label(value, name, max = 160) {
  check(value === null || typeof value === "string", `${name} must be text.`);
  const result = (value ?? "").trim();
  check(result.length <= max && !/[\x00-\x1f\x7f]/.test(result), `${name} is too long or contains control characters.`);
  return result;
}
function flag(value) {
  if ([true, 1, "1", "TRUE", "true", "Yes", "yes"].includes(value)) return "1";
  check([false, 0, "0", "FALSE", "false", "No", "no", "", null].includes(value), "Use an explicit checkbox value.");
  return "";
}
function eo(value) {
  if ([null, undefined, "", "Not set"].includes(value)) return null;
  return flag(value) === "1";
}
export function normalizeRoleMemberships(rows) {
  check(Array.isArray(rows) && rows.length <= 300, "Use at most 300 role mappings.");
  const keys = new Set();
  return rows.map((input) => {
    check(Array.isArray(input) && [13, 14].includes(input.length), "Role mappings require the exact 13 legacy or 14 current columns.");
    const role = label(input[0], "Role Shortform"), formal = label(input[1], "Formal Role Name", 240);
    check(role || formal, "A no-role mapping requires a Formal Role Name; blank rows are not mappings.");
    const key = roleKey(role);
    check(!keys.has(key), "Each Role Shortform may appear once, including the explicit no-role mapping.");
    keys.add(key);
    const groups = input.slice(2, 12).map(flag);
    check(!(groups[2] === "1" && groups[9] === "1"), "MK membership and SMC cannot be assigned together.", "MKE_SMC_INVALID", 409);
    return [role, formal, ...groups, label(input[12], "EO Appt Level"), eo(input[13])];
  });
}
export function roleMapping(doc, teacher) {
  if (doc.roleMembershipSchema !== 1) return null;
  const role = versionRole(doc, teacher);
  return (doc.membership || []).find((row) => roleKey(row[0]) === roleKey(role)) || null;
}
export function roleGroups(teacher, row) {
  const existing = teacher.deploymentTags?.Memberships ?? teacher.groups ?? [];
  check(Array.isArray(existing), "Stored Memberships must be a list.");
  const value = [...existing.filter((name) => !ROLE_GROUPS.includes(name)), ...ROLE_GROUPS.filter((_, i) => row[i + 2] === "1")];
  try { return normalizeDirectValue("memberships", value); }
  catch { check(false, "Role mappings and custom Memberships exceed the supported label bounds."); }
}
/** Planning projections do not modify the current accepted authority evidence. */
export function applyRoleMemberships(doc) {
  if (doc.roleMembershipSchema !== 1) return doc;
  doc.membership = normalizeRoleMemberships(doc.membership || []);
  for (const teacher of doc.teachers || []) {
    const row = roleMapping(doc, teacher);
    if (!row) continue;
    const groups = roleGroups(teacher, row);
    teacher.groups = groups;
    teacher.deploymentTags = { ...teacher.deploymentTags, Memberships: [...groups], "EO Appt Level": row[12] || null };
    teacher.profile = { ...teacher.profile, "EO Appt Level": row[12] };
  }
  doc.contactsMemberships = (doc.teachers || []).map((teacher) => [teacher.id, teacher.ttbName || teacher.name,
    versionRole(doc, teacher), (teacher.deploymentTags?.Memberships || teacher.groups || []).join("\n")]);
  return doc;
}
export function authorityValue(doc, teacher) {
  const row = roleMapping(doc, teacher);
  if (!row) return null;
  check(!(row[4] === "1" && (teacher.mk === true || ["mk", "mke"].includes(String(teacher.schoolSection || "").toLowerCase()))),
    "An MK staff member cannot receive SMC authority.", "MKE_SMC_INVALID", 409);
  return { memberships: roleGroups(teacher, row), smc: row[4] === "1", schoolLeader: row[2] === "1",
    ...(typeof row[13] === "boolean" ? { eo: row[13] } : {}) };
}

/** A person editor may change custom groups, never contradict its explicit role row. */
export function checkManagedMemberships(doc, teacher, value) {
  const row = roleMapping(doc, teacher);
  if (!row) return;
  let supplied;
  try { supplied = normalizeDirectValue("memberships", value); }
  catch { check(false, "Use valid Membership labels within the supported bounds."); }
  check(ROLE_GROUPS.every((name, i) => supplied.includes(name) === (row[i + 2] === "1")),
    "Managed Memberships come from Role Membership. Change that matrix; use this field for custom labels.",
    "USE_ROLE_MATRIX", 409);
}
