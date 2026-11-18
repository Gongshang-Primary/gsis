/** Version-owned planning choices. These functions never grant application access
 * or replace the accepted authority/eligibility used by Core and Roster. */
import { previewTTb } from "./ttb-name.mjs";

const own = (value, key) => Object.hasOwn(value || {}, key);
const managed = ["SL", "SC", "SMC", "KP", "TL", "SDT", "CMT", "SAT", "Support", "MK"];
const text = value => typeof value === "string" ? value : typeof value?.code === "string" ? value.code : "";
const key = value => text(value).trim().toLowerCase();
const labels = value => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const activity = value => value === true || value === "Y" ? true
  : value === false || value === "N" ? false : null;
const nameFields = ["Basic Name", "Employment Modifier", "Subject Modifier", "MK Modifier", "Role"];
const modifierList = value => text(value).split(/[,;]/).map(item => item.trim()).filter(Boolean);

function planningName(teacher, profile, draft) {
  const basicName = text(profile["Basic Name"]).trim();
  const cachedName = teacher.ttbName || teacher.profile?.["TTb Name"] || teacher.name;
  const inputs = teacher.ttbNameInputs;
  const nameEdited = nameFields.some(field => own(draft, field));
  if (!basicName || (!nameEdited && cachedName && (!inputs || cachedName !== basicName)))
    return cachedName;
  const acceptedTags = labels(teacher.deploymentTags?.["Employment Modifier"]);
  const arrangement = key(teacher.deploymentTags?.["Employment Arrangement"]);
  const employmentTags = modifierList(profile["Employment Modifier"])
    .filter(tag => !arrangement || key(tag) !== arrangement || acceptedTags.some(accepted => key(accepted) === arrangement));
  const result = previewTTb({
    basicName,
    employmentTags,
    subjectTags: modifierList(profile["Subject Modifier"]),
    mkTags: modifierList(profile["MK Modifier"]),
    role: text(profile.Role).trim(),
    nameSuffix: inputs?.nameSuffix,
  }, inputs?.presentation, { retainBasicNameTags: true });
  return result.available ? result.name : cachedName;
}

export function projectPlanningNames(doc) {
  for (const teacher of doc.teachers || []) {
    const draft = doc.teacherDrafts?.[teacher.id];
    const profile = { ...teacher.profile, ...planningSnapshot(teacher), ...draft };
    const name = planningName(teacher, profile, draft);
    if (name && (name !== teacher.name || name !== teacher.ttbName)) Object.assign(teacher, { name, ttbName: name });
  }
  return doc;
}

/** Capture only actual ordinary version values, never a fabricated Active=true.
 * The explicit refresh flag is used by the existing create/duplicate contract. */
export function planningSnapshot(teacher) {
  const profile = teacher?.profile || {}, previous = teacher?.planningProfile || {};
  // Explicit unknown prevents a later Contacts refresh from fabricating the
  // version's missing activity. This annotation is not a publication clear.
  const result = { Active: null };
  if (own(previous, "Active")) result.Active = previous.Active;
  else if (own(profile, "Active")) result.Active = profile.Active;
  else if (teacher?.activeKnown !== false && activity(teacher?.active) !== null)
    result.Active = activity(teacher.active) ? "Y" : "N";
  if (own(previous, "Role")) result.Role = previous.Role;
  else if (own(profile, "Role")) result.Role = profile.Role;
  else if (own(teacher, "role")) result.Role = teacher.role;
  return result;
}

export function planningPerson(doc, teacher) {
  const draft = doc?.teacherDrafts?.[teacher.id] || {};
  const saved = planningSnapshot(teacher);
  const profile = { ...(teacher.profile || {}), ...saved, ...draft };
  const active = activity(profile.Active);
  const role = text(profile.Role || "");
  const mapping = doc?.roleMembershipSchema === 1
    ? (doc.membership || []).find(row => key(row[0]) === key(role)) : null;
  const original = own(teacher.deploymentTags, "Memberships")
    ? labels(teacher.deploymentTags.Memberships) : labels(teacher.groups);
  const groups = mapping
    ? [...original.filter(label => !managed.some(name => key(name) === key(label))),
      ...managed.filter((_, i) => mapping[i + 2] === "1")]
    : original;
  const has = label => groups.some(value => key(value) === key(label));
  const section = own(draft, "School Section") ? draft["School Section"]
    : teacher.deploymentTags?.["School Section"] ?? teacher.schoolSection ?? profile["School Section"];
  const category = own(draft, "Personnel Category") ? draft["Personnel Category"]
    : teacher.deploymentTags?.["Personnel Category"] ?? teacher.personnelCategory ?? profile["Personnel Category"];
  const mk = has("MK") || ["mk", "mke"].includes(key(section)) || teacher.mk === true
    || !!text(profile["MK Modifier"]).trim() || (!mapping && /^MK(?:\b|E)/i.test(role));
  const sat = has("SAT") || (!mapping && /^SAT$/i.test(role));
  const support = has("Support") || /^(?:support(?: staff)?|non[- ]?teaching|eas|oso|science lab tech(?:nician)?)$/i.test(text(category))
    || (!mapping && /^(?:AE|AM(?: \(ICT\))?|Counsellor|CSO|DE|Dentist|ICT [AM]|Library|Librarian|Reception(?:ist)?|OM|OSO|Recep|SC|Sci Lab|SENO|Support(?: Staff)?)$/i.test(role));
  const sl = mapping ? has("SL") : has("SL") || teacher.authority?.schoolLeader?.value === true
    || /^(?:SLs?|School Leaders?|P|VP(?:\b.*)?)$/i.test(role);
  const name = planningName(teacher, profile, draft);
  return { ...teacher, ...(name ? { name, ttbName: name } : {}), profile, role,
    active: active === true, activeKnown: active !== null,
    groups, mk, sat, support, sl };
}

export function planningEligible(doc, teacher) {
  if (!teacher) return false;
  const p = planningPerson(doc, teacher);
  return !!p.id && !p.orphan && p.activeKnown && p.active && !p.mk && !p.sat && !p.support && !p.sl;
}
export function reportingEligible(doc, teacher) {
  if (!teacher) return false;
  const p = planningPerson(doc, teacher);
  return !!p.id && !p.orphan && p.activeKnown && p.active && (!p.mk || p.sat);
}
export function reportingRoot(doc, teacher) {
  return !!teacher && planningPerson(doc, teacher).sl;
}
export function reportingLinks(doc) {
  const reporting = doc?.reporting;
  // Empty aliases are not whole-graph clears. An explicit per-person blank is.
  return { ...Object.fromEntries((reporting?.staff || []).filter(p => p.id && own(p, "ro") && p.ro)
    .map(p => [p.id, p.ro || ""])), ...(reporting?.officers || {}), ...(reporting?.parents || {}) };
}
export function hasReportingEdge(doc, id) {
  const reporting = doc?.reporting;
  return !!(reporting?.parents?.[id] || reporting?.officers?.[id] ||
    reporting?.staff?.some(person => person.id === id && person.ro));
}
export function reportingConflicts(doc) {
  const reporting = doc?.reporting || {};
  const aliases = new Map();
  const add = (id, name, value) => {
    if (!aliases.has(id)) aliases.set(id, {});
    aliases.get(id)[name] = value;
  };
  for (const [id, value] of Object.entries(reporting.parents || {})) add(id, "parent", value);
  for (const [id, value] of Object.entries(reporting.officers || {})) add(id, "officer", value);
  for (const [index, row] of (reporting.staff || []).entries()) if (row.id && own(row, "ro") && row.ro)
    add(row.id, "staff:" + index, row.ro);
  return [...aliases].flatMap(([id, values]) => new Set(Object.values(values)).size > 1
    ? [{ id, parent: values.parent, officer: values.officer, values: Object.values(values) }] : []);
}

/** Retained excluded relationships remain inspectable; they are never new choices. */
export function reportingStaff(doc, { retainHistorical = false } = {}) {
  const people = new Map((doc?.teachers || []).filter(p => p.id).map(p => [p.id, p]));
  const links = reportingLinks(doc);
  const conflicts = reportingConflicts(doc);
  const linked = new Set([...Object.keys(links), ...Object.values(links).filter(Boolean),
    ...conflicts.flatMap(row => [row.id, ...row.values]).filter(Boolean)]);
  if (retainHistorical) for (const p of doc?.reporting?.staff || [])
    if (p.id && linked.has(p.id) && !people.has(p.id)) people.set(p.id, { ...p, orphan: true });
  if (retainHistorical) for (const id of linked) if (!people.has(id))
    people.set(id, { id, name: id, activeKnown: false, orphan: true });
  return [...people.values()].flatMap(person => {
    const projected = planningPerson(doc, person), allowed = reportingEligible(doc, person);
    if (!allowed && !(retainHistorical && linked.has(person.id))) return [];
    return [{ ...projected, reportingAllowed: allowed, historical: !allowed }];
  }).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)) || a.id.localeCompare(b.id));
}
