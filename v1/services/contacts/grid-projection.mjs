// Contacts-owned presentation only. Callers must apply publicStaff privacy first.
export const CONTACT_FIELD_MAP = Object.freeze({
  "TTb Name": "ttbName",
  "Basic Name": "basicName",
  "Statutory Name": "statutoryName",
  "iCON Alias (@moe.edu.sg)": "iconEmail",
  "CES Alias (@schools.gov.sg)": "cesEmail",
  "GSPS Alias (@gsps.edu.sg)": "email",
  "Mobile No": "mobile",
  EXT: "ext",
  "Day of Birth": "birthday",
  "Month of birth": "birthday",
  Role: "role",
  "EO Appt Level": "eoAppointmentLevel",
  "Appointment Status": "appointmentStatus",
  "Employment Modifier": "employmentTags",
  "Subject Modifier": "subjectTags",
  Active: "employmentActive",
  "MK Modifier": "mkTags",
});
// This public order intentionally differs from the legacy writer's field map.
export const CONTACT_GRID_FIELDS = Object.freeze([
  "Basic Name",
  "TTb Name",
  "Statutory Name",
  "Mobile No",
  "EXT",
  "Role",
  "EO Appt Level",
  "Appointment Status",
  "Active",
  "Employment Modifier",
  "Subject Modifier",
  "MK Modifier",
  "Day of Birth",
  "Month of birth",
  "GSPS Alias (@gsps.edu.sg)",
  "iCON Alias (@moe.edu.sg)",
  "CES Alias (@schools.gov.sg)",
]);
const editable = new Set([
  "Basic Name",
  "Statutory Name",
  "Mobile No",
  "Active",
  "GSPS Alias (@gsps.edu.sg)",
  "iCON Alias (@moe.edu.sg)",
  "CES Alias (@schools.gov.sg)",
]);
export function contactAliasDomains({ schoolDomain } = {}) {
  return {
    gsps: schoolDomain ?? "",
    icon: "moe.edu.sg",
    ces: "schools.gov.sg",
  };
}
function effective(person, name) {
  const row = person.fields?.[name];
  return row?.state === "accepted" &&
    row.effective === true &&
    row.revoked !== true
    ? row.value
    : null;
}
function codes(value) {
  if (Array.isArray(value)) return value.map(codes).join(", ");
  if (value && typeof value === "object")
    return typeof value.code === "string" ? value.code : "";
  return value === null || value === undefined ? "" : String(value);
}
function address(value) {
  return typeof value === "string" ? value : "";
}
function alias(value, domain) {
  const full = address(value),
    match = /^([^\s@]+)@([^\s@]+\.[^\s@]+)$/.exec(full);
  return match && match[2].toLowerCase() === String(domain).toLowerCase()
    ? match[1]
    : full;
}
function values(person, options) {
  const field = (name) => effective(person, name),
    domains = contactAliasDomains(options),
    basic = person.basicName ?? person.name ?? "",
    ttb = person.ttbName ?? basic,
    birthday = field("birthday"),
    birthdayParts =
      typeof birthday === "string"
        ? /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(birthday)
        : null;
  return {
    "Basic Name": String(basic),
    "TTb Name": String(ttb),
    "Statutory Name": codes(field("statutoryName")),
    "Mobile No": codes(field("mobile")),
    EXT: codes(field("ext")),
    Role: codes(field("role")),
    "EO Appt Level": codes(field("eoAppointmentLevel")),
    "Appointment Status": codes(field("appointmentStatus")),
    Active: person.active === true ? "Y" : person.active === false ? "N" : "",
    "Employment Modifier": codes(field("employmentTags")),
    "Subject Modifier": codes(field("subjectTags")),
    "MK Modifier": codes(field("mkTags")),
    "Day of Birth": birthdayParts ? String(Number(birthdayParts[2])) : "",
    "Month of birth": birthdayParts ? String(Number(birthdayParts[1])) : "",
    "GSPS Alias (@gsps.edu.sg)": alias(field("email"), domains.gsps),
    "iCON Alias (@moe.edu.sg)": alias(field("iconEmail"), domains.icon),
    "CES Alias (@schools.gov.sg)": alias(field("cesEmail"), domains.ces),
  };
}
export function gridValues(person, options) {
  const cells = values(person, options);
  return CONTACT_GRID_FIELDS.map((field) => cells[field]);
}
export function projectGridRow(person, options) {
  return {
    id: person.staffId ?? person.id,
    staffId: person.staffId ?? person.id,
    revision: person.revision,
    values: gridValues(person, options),
    computed: CONTACT_GRID_FIELDS.map((field) => !editable.has(field)),
  };
}
export function projectGridPerson(person, options) {
  const cells = values(person, options),
    memberships = effective(person, "memberships");
  return {
    id: person.staffId ?? person.id,
    staffId: person.staffId ?? person.id,
    revision: person.revision,
    name: cells["TTb Name"],
    basicName: cells["Basic Name"],
    ttbName: cells["TTb Name"],
    statutoryName: cells["Statutory Name"],
    mobile: cells["Mobile No"],
    ext: cells.EXT,
    role: cells.Role,
    appointmentLevel: cells["EO Appt Level"],
    appointmentStatus: cells["Appointment Status"],
    active: cells.Active,
    employment: cells["Employment Modifier"],
    subject: cells["Subject Modifier"],
    mk: cells["MK Modifier"],
    dayOfBirth: cells["Day of Birth"],
    monthOfBirth: cells["Month of birth"],
    emails: {
      gsps: address(effective(person, "email")),
      icon: address(effective(person, "iconEmail")),
      ces: address(effective(person, "cesEmail")),
    },
    groups: Array.isArray(memberships) ? memberships.map(codes) : [],
  };
}
