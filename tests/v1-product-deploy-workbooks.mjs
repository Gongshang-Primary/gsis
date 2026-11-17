import assert from "node:assert/strict";
import AscExport from "../shared/asc-export.js";
import {
  defaults,
  applyEdits,
  calculate,
  mergeContacts,
  canonicalTeachingDocument,
  changedTeachingStaff,
  validateTeachingBindings,
} from "../v1/services/deploy/model.mjs";
import {
  SCHEMAS,
  exportWorkbook,
  validateWorkbook,
} from "../v1/services/deploy/workbooks.mjs";
const person = (id, name, profile = {}) => ({
  id,
  staffId: id,
  name,
  active: true,
  schoolSection: "primary",
  profile: {
    "Basic Name": name,
    "EO Appt Level": "EO",
    Active: "Y",
    ...profile,
  },
  authority: {
    eo: { value: true },
    smc: { value: false },
    schoolLeader: { value: false },
  },
  groups: [],
  quality: "verified",
  fieldRevisions: { eo: "eo1", smc: "smc1", schoolLeader: "sl1" },
});
const staff = [
  person("staff-a", "Alpha", { "Employment Modifier": "4/5;BT" }),
  person("staff-b", "Beta"),
];
const d = {
  ...defaults(),
  id: "v1",
  name: "Plan",
  revision: 1,
  teachers: staff,
  classes: [
    { ref: "class-a", level: "1", name: "Perseverance", shortName: "P" },
    { ref: "class-b", level: "2", name: "Thrift", shortName: "T" },
  ],
  groups: [
    {
      id: "tg-a",
      name: "TG A",
      subject: "Music",
      level: "1",
      levels: ["1"],
      classRefs: ["class-a"],
      weeklyPeriods: 0,
    },
  ],
  assignments: [
    {
      id: "assign-a",
      target: "1P",
      targetRef: "class-a",
      subject: "EL",
      teacher: "staff-a",
      level: "1",
    },
    {
      id: "assign-b",
      target: "2T",
      targetRef: "class-b",
      subject: "EL",
      teacher: "staff-b",
      level: "2",
    },
    {
      id: "assign-ft",
      target: "1P",
      targetRef: "class-a",
      subject: "FT",
      teacher: "staff-a",
      level: "1",
    },
    {
      id: "assign-tg",
      target: "tg-a",
      subject: "Music",
      teacher: "staff-b",
      level: "1",
    },
  ],
};
d.loads["1"].EL = 10;
d.loads["2"].EL = 2;
d.loads["1"].Assembly = 6;
const projection = {
  staff,
  revision: "contacts-1",
  asOf: Date.now(),
  observation: { id: "observation-a" },
};
const result = calculate(d, projection),
  a = result.rows.find((r) => r.staffId === "staff-a");
assert.equal(Number(a.Wi.toFixed(2)), 41.96);
assert.equal(a.weeklyBudget, 67.2);
assert.equal(Number(a.offload.toFixed(2)), 0.2);
assert.equal(Math.floor(a.factor * (a.weeklyBudget - a.Wi)), 18);
assert.equal(a.quality, "verified");
const cappedFacts = structuredClone(projection);
cappedFacts.staff[0].profile["Employment Modifier"] = "UT";
const cappedPlan = structuredClone(d);
cappedPlan.workload = {
  categories: { EL: "Teaching", Assembly: "FTT" },
  nonTeachingActivities: [
    {
      id: "meeting",
      code: "MEETING",
      name: "Weekly meeting",
      weeklyPeriods: 2,
      teachers: ["staff-a"],
    },
  ],
};
const capped = calculate(cappedPlan, cappedFacts),
  cappedRow = capped.rows.find((r) => r.staffId === "staff-a");
assert.equal(cappedRow.cap, 26);
assert.equal(cappedRow.capConfigured, true);
assert.equal(cappedRow.capBasis, "total");
assert.deepEqual(cappedRow.capNonTeachingPeriods, { DUTY: 0, MEETING: 2 });
assert.equal(cappedRow.quality, "verified");
assert.deepEqual(capped.subjectCategories, {
  EL: "Teaching",
  Assembly: "FTT",
  MEETING: "Non-teaching",
});
const incompletePlan = structuredClone(cappedPlan);
incompletePlan.loads["1"].EL = null;
const incompleteRow = calculate(incompletePlan, cappedFacts).rows.find(
  (r) => r.staffId === "staff-a",
);
assert.notEqual(incompleteRow.quality, "verified");
assert.equal(
  incompleteRow.capNonTeachingPeriods,
  null,
  "Incomplete input cannot become verified empty reservations.",
);
assert.equal(
  a.capNonTeachingPeriods,
  null,
  "A source without a non-teaching reservation map remains absent.",
);
const unknown = structuredClone(projection);
unknown.staff[0].quality = "unavailable";
assert.notEqual(calculate(d, unknown).rows[0].quality, "verified");
const ip = exportWorkbook(d, "IP", "school", 1);
assert.deepEqual(ip.sheets.Classes.columns, SCHEMAS.IP.Classes);
const changed = structuredClone(ip);
changed.sheets.Classes.rows[0][2] = "Respect";
changed.sheets.Classes.rows[0][3] = "R";
const imported = validateWorkbook(changed, d, "school", 1).document;
assert.equal(imported.classes[0].shortName, "R");
assert.deepEqual(
  imported.assignments.find((a) => a.id === "assign-tg"),
  d.assignments.find((a) => a.id === "assign-tg"),
);
const tg = exportWorkbook(d, "TG", "school", 1);
assert.deepEqual(
  validateWorkbook(tg, d, "school", 1).document.assignments.filter(
    (a) => a.id !== "assign-tg",
  ),
  d.assignments.filter((a) => a.id !== "assign-tg"),
);
assert.throws(
  () => validateWorkbook(ip, d, "foreign", 1),
  (e) => e.code === "SCHOOL_MISMATCH",
);
assert.throws(
  () => validateWorkbook(ip, d, "school", 2),
  (e) => e.code === "REVISION_CONFLICT",
);
const bad = structuredClone(ip);
bad.sheets.Classes.rows = [];
assert.throws(
  () => validateWorkbook(bad, d, "school", 1),
  (e) => e.code === "DEPENDENCY_CONFLICT",
);
const memberships = exportWorkbook(d, "Membership", "school", 1);
assert.deepEqual(
  validateWorkbook(memberships, d, "school", 1).document.teachers,
  d.teachers,
  "Membership workbook round trip preserves unknown values.",
);
// A distinct canonical scope prevents role matrices from being confused with
// the existing per-person Membership import contract.
const roleBook = exportWorkbook(d, "Role Membership", "school", 1);
assert.deepEqual(roleBook.sheets["Role Membership"].columns, SCHEMAS["Role Membership"]["Role Membership"]);
assert.equal(roleBook.sheets["Role Membership"].columns.length, 14);
roleBook.sheets["Role Membership"].rows = [["", "No role", "", "", "1", "", "", "", "", "", "", "", "ST", null]];
const roleDoc = validateWorkbook(roleBook, d, "school", 1).document;
assert.equal(roleDoc.roleMembershipSchema, 1);
assert.equal(roleDoc.membership[0][13], null, "appointment grade never implies an EO grant");
assert.deepEqual(roleDoc.teachers[0].groups, ["SMC"]);
assert.equal(roleDoc.teachers[0].authority.smc.value, false, "import is only a planning edit");
assert.deepEqual(validateWorkbook(exportWorkbook(roleDoc, "Role Membership", "school", 1), roleDoc, "school", 1).document.membership, roleDoc.membership);
const wrongScope = structuredClone(roleBook);
wrongScope.metadata["Table Scope"] = "Membership";
assert.throws(() => validateWorkbook(wrongScope, d, "school", 1), /sheet|columns|scope/i);
const wrongWidth = structuredClone(roleBook);
wrongWidth.sheets["Role Membership"].rows[0].pop();
assert.throws(() => validateWorkbook(wrongWidth, d, "school", 1), /width|columns|cells/i);
const managedImport = exportWorkbook(roleDoc, "Membership", "school", 1);
managedImport.sheets.Membership.rows[0][3] = "Custom only";
assert.throws(() => validateWorkbook(managedImport, roleDoc, "school", 1), (error) => error.code === "USE_ROLE_MATRIX");
const legacyRow = [...roleDoc.membership[0].slice(0, 13)];
const legacyEdit = applyEdits(d, [{ operation: "setRoleMemberships", expected: [], value: [legacyRow] }]);
assert.equal(legacyEdit.membership[0][13], null);
const readonly = exportWorkbook(d, "HR Terms", "school", 1);
assert.equal(validateWorkbook(readonly, d, "school", 1).document.hrChoicesSchema, 1);
const alteredRole = structuredClone(readonly);
alteredRole.sheets["HR Terms"].rows.find(row => row[0] === "Role")[1] = "Unconfigured Role";
assert.throws(() => validateWorkbook(alteredRole, d, "school", 1), /Edit roles in Membership/);
const teachers = exportWorkbook(d, "Teachers", "school", 1);
teachers.sheets.Teachers.rows[0][4] = "ST";
assert.throws(
  () => validateWorkbook(teachers, d, "school", 1),
  /reference-only/,
);
const visible = exportWorkbook(d, "IP", "school", 1, { visible: true });
assert.throws(
  () => validateWorkbook(visible, d, "school", 1),
  /Reporting-only/,
);
const off = exportWorkbook(d, "Offload", "school", 1);
const nullable = off.sheets.Offload.rows.find((r) => r[3] === "MTT");
assert.equal(nullable[4], null);
assert.equal(
  validateWorkbook(off, d, "school", 1).document.offload.tags.find(
    (r) => r.match === "MTT",
  ).percent,
  "",
);
assert.throws(
  () =>
    applyEdits(d, [
      {
        operation: "setTeacherField",
        teacher: "staff-a",
        field: "EO Appt Level",
        value: "EO",
      },
    ]),
  /approved Contacts/,
);
assert.throws(
  () => applyEdits(d, [{ operation: "setMembership", value: [] }]),
  (e) => e.code === "REFERENCE_ONLY",
);
const next = applyEdits(d, [
  {
    operation: "setTeacherNote",
    teacher: "staff-a",
    expected: "",
    value: "Review",
  },
]);
assert.equal(next.teacherNotes["staff-a"], "Review");
assert.equal(d.teacherNotes["staff-a"], undefined);
const boss = person("staff-root", "Root");
boss.authority.schoolLeader.value = true;
boss.groups = ["SL"];
const socDoc = {
  ...structuredClone(d),
  teachers: [...staff, boss],
  reporting: {
    officers: { "staff-a": "staff-root", "staff-b": "staff-a" },
    roColumnIds: ["staff-b"],
  },
};
const soc = exportWorkbook(socDoc, "Span of Control", "school", 1);
assert(soc.sheets["RO Columns"].columns.some((c) => c.endsWith("[staff-b]")));
assert.deepEqual(
  validateWorkbook(soc, socDoc, "school", 1).document.reporting.parents,
  { "staff-a": "staff-root", "staff-b": "staff-a", "staff-root": "" },
);
const oneSide = structuredClone(soc);
oneSide.sheets.Hierarchy.rows.find((r) => r[0] === "staff-b")[2] = "staff-root";
assert.equal(
  validateWorkbook(oneSide, socDoc, "school", 1).document.reporting.parents[
    "staff-b"
  ],
  "staff-root",
);
const cycle = structuredClone(soc);
cycle.sheets.Hierarchy.rows.find((r) => r[0] === "staff-a")[2] = "staff-b";
assert.throws(() => validateWorkbook(cycle, socDoc, "school", 1), /cycle/);
const rootChange = structuredClone(soc);
rootChange.sheets.Hierarchy.rows.find((r) => r[0] === "staff-root")[2] =
  "staff-a";
assert.throws(
  () => validateWorkbook(rootChange, socDoc, "school", 1),
  /root is protected/,
);
const foreignName = structuredClone(soc);
const column = foreignName.sheets["RO Columns"];
const i = column.columns.findIndex((c) => c.endsWith("[staff-root]"));
column.columns[i] = "Forged [staff-root]";
assert.throws(
  () => validateWorkbook(foreignName, socDoc, "school", 1),
  (e) => e.code === "STAFF_NAME_CONFLICT",
);

// Span is an immediate projection of version-owned planning staff. Its wider
// list is independent of teaching eligibility and accepted application grants.
const spanTeacher = person("span-teacher", "Synthetic Span Teacher"),
  spanMK = { ...person("span-mk", "Synthetic Span MK"), mk: true, groups: ["MK"] },
  spanSAT = { ...person("span-sat", "Synthetic Span SAT"), groups: ["SAT"] },
  spanSATMK = { ...person("span-sat-mk", "Synthetic Span SAT MK"), mk: true, groups: ["SAT", "MK"] },
  spanSupport = { ...person("span-support", "Synthetic Span Support"), groups: ["Support"] },
  spanLeader = person("span-leader", "Synthetic Span Leader", { Role: "Version Leader" }),
  spanOSO = person("span-oso", "Synthetic Span OSO", { Role: "OSO" }),
  spanInactive = { ...person("span-inactive", "Synthetic Span Inactive", { Active: "N" }), active: false },
  spanUnknown = { ...person("span-unknown", "Synthetic Span Unknown"), activeKnown: false },
  spanNoEO = person("span-no-eo", "Synthetic Span Missing Optional EO", { "EO Appt Level": "" });
delete spanUnknown.profile.Active;
delete spanNoEO.authority.eo;
const spanDoc = { ...structuredClone(d), teachers: [spanTeacher, spanMK, spanSAT,
  spanSATMK, spanSupport, spanLeader, spanOSO, spanInactive, spanUnknown, spanNoEO],
  assignments: [], reporting: null, roleMembershipSchema: 1,
  membership: [["Version Leader", "Synthetic version leader", "1", ...Array(9).fill(""), "", null]],
};
const beforeSpan = structuredClone(spanDoc);
const immediateSpan = exportWorkbook(spanDoc, "Span of Control", "school", 1),
  spanIds = immediateSpan.sheets.Hierarchy.rows.map(row => row[0]);
for (const p of [spanTeacher, spanSAT, spanSATMK, spanSupport, spanLeader, spanOSO, spanNoEO])
  assert(spanIds.includes(p.id), p.id + " is available without Initialize or optional EO evidence");
for (const p of [spanMK, spanInactive, spanUnknown]) assert(!spanIds.includes(p.id));
assert.equal(immediateSpan.sheets.Hierarchy.rows.find(row => row[0] === spanLeader.id)[5], true,
  "the explicit version SL flag protects the root without granting accepted authority");
assert.equal(spanLeader.authority.schoolLeader.value, false);
assert.deepEqual(spanDoc, beforeSpan, "export must not initialize or rewrite the stored graph");
const firstSpanEdit = structuredClone(immediateSpan);
firstSpanEdit.sheets.Hierarchy.rows.find(row => row[0] === spanTeacher.id)[2] = spanSupport.id;
const initializedSpan = validateWorkbook(firstSpanEdit, spanDoc, "school", 1).document;
assert.equal(initializedSpan.reporting.parents[spanTeacher.id], spanSupport.id);
assert.deepEqual(initializedSpan.teachers.map(t => [t.id, t.authority, t.fieldRevisions]),
  beforeSpan.teachers.map(t => [t.id, t.authority, t.fieldRevisions]),
  "a reporting import does not change accepted staff authority");
const classifiedRootChange = structuredClone(immediateSpan);
classifiedRootChange.sheets.Hierarchy.rows.find(row => row[0] === spanLeader.id)[2] = spanTeacher.id;
assert.throws(() => validateWorkbook(classifiedRootChange, spanDoc, "school", 1), /root is protected/);

const legacySpan = { ...structuredClone(spanDoc), reporting: {
  parents: { [spanTeacher.id]: spanMK.id, [spanMK.id]: spanLeader.id,
    [spanInactive.id]: spanLeader.id, "span-retired-record": spanLeader.id },
  staff: [{ id: "span-retired-record", name: "Synthetic Retained Staff",
    active: false, groups: [], ro: spanLeader.id, retainedNote: "Synthetic history" }],
} };
const retainedSpan = exportWorkbook(legacySpan, "Span of Control", "school", 1);
for (const id of [spanMK.id, spanInactive.id, "span-retired-record"]) {
  assert(retainedSpan.sheets.Hierarchy.rows.some(row => row[0] === id));
  assert(retainedSpan.metadata["Historical Reporting Staff IDs"].split("\n").includes(id));
}
const roundTripSpan = validateWorkbook(retainedSpan, legacySpan, "school", 1).document;
for (const [id, parent] of Object.entries(legacySpan.reporting.parents))
  assert.equal(roundTripSpan.reporting.parents[id], parent, "retained excluded links survive import");
assert.equal(roundTripSpan.reporting.staff.find(p => p.id === "span-retired-record").retainedNote,
  "Synthetic history", "historical reporting metadata is not discarded");
const clearLegacy = structuredClone(retainedSpan);
clearLegacy.sheets.Hierarchy.rows.find(row => row[0] === spanMK.id)[2] = "";
assert.equal(validateWorkbook(clearLegacy, legacySpan, "school", 1).document.reporting.parents[spanMK.id], "");
const clearOrphan = structuredClone(retainedSpan);
clearOrphan.sheets.Hierarchy.rows.find(row => row[0] === "span-retired-record")[2] = "";
const orphanCleared = validateWorkbook(clearOrphan, legacySpan, "school", 1).document;
assert(!Object.hasOwn(orphanCleared.reporting.parents, "span-retired-record"));
assert(!Object.hasOwn(orphanCleared.reporting.officers, "span-retired-record"));
assert.equal(orphanCleared.reporting.staff.find(row => row.id === "span-retired-record").ro, "");
assert.equal(orphanCleared.reporting.staff.find(row => row.id === "span-retired-record").retainedNote, "Synthetic history");
assert(!exportWorkbook(orphanCleared, "Span of Control", "school", 1).sheets.Hierarchy.rows
  .some(row => row[0] === "span-retired-record"), "clearing the last orphan edge must not recreate a blank orphan alias");
const incomingOnly = { ...structuredClone(spanDoc), reporting: {
  parents: { [spanTeacher.id]: "span-missing-parent" },
} };
const incomingBook = exportWorkbook(incomingOnly, "Span of Control", "school", 1);
assert(incomingBook.sheets.Hierarchy.rows.some(row => row[0] === "span-missing-parent"));
const incomingRoundTrip = validateWorkbook(incomingBook, incomingOnly, "school", 1).document;
assert.equal(incomingRoundTrip.reporting.parents[spanTeacher.id], "span-missing-parent");
assert(!Object.hasOwn(incomingRoundTrip.reporting.parents, "span-missing-parent"));
assert(!Object.hasOwn(incomingRoundTrip.reporting.officers, "span-missing-parent"));
assert(!incomingRoundTrip.reporting.staff.some(row => row.id === "span-missing-parent"));
assert(!incomingRoundTrip.reporting.roColumnIds.includes("span-missing-parent"));
const clearIncoming = structuredClone(incomingBook);
clearIncoming.sheets.Hierarchy.rows.find(row => row[0] === spanTeacher.id)[2] = "";
const incomingCleared = validateWorkbook(clearIncoming, incomingOnly, "school", 1).document;
assert(!exportWorkbook(incomingCleared, "Span of Control", "school", 1).sheets.Hierarchy.rows
  .some(row => row[0] === "span-missing-parent"));
const staleRootEdge = { ...structuredClone(spanDoc), reporting: { parents: { [spanLeader.id]: spanTeacher.id } } };
const clearRoot = exportWorkbook(staleRootEdge, "Span of Control", "school", 1);
clearRoot.sheets.Hierarchy.rows.find(row => row[0] === spanLeader.id)[2] = "";
assert.equal(validateWorkbook(clearRoot, staleRootEdge, "school", 1).document.reporting.parents[spanLeader.id], "",
  "a protected root may clear an existing stale edge but cannot gain a new parent");
const newExcludedParent = structuredClone(retainedSpan);
newExcludedParent.sheets.Hierarchy.rows.find(row => row[0] === spanTeacher.id)[2] = spanInactive.id;
assert.throws(() => validateWorkbook(newExcludedParent, legacySpan, "school", 1), /currently eligible staff/);
const newExcludedChild = structuredClone(retainedSpan);
newExcludedChild.sheets.Hierarchy.rows.find(row => row[0] === spanMK.id)[2] = spanSupport.id;
assert.throws(() => validateWorkbook(newExcludedChild, legacySpan, "school", 1), /currently eligible staff/);
const spanSelf = structuredClone(retainedSpan);
spanSelf.sheets.Hierarchy.rows.find(row => row[0] === spanTeacher.id)[2] = spanTeacher.id;
assert.throws(() => validateWorkbook(spanSelf, legacySpan, "school", 1), /Self-parent/);
const spanCycle = structuredClone(retainedSpan);
spanCycle.sheets.Hierarchy.rows.find(row => row[0] === spanTeacher.id)[2] = spanSupport.id;
spanCycle.sheets.Hierarchy.rows.find(row => row[0] === spanSupport.id)[2] = spanTeacher.id;
assert.throws(() => validateWorkbook(spanCycle, legacySpan, "school", 1), /cycle/);
const spanForeign = structuredClone(retainedSpan);
spanForeign.metadata["School ID"] = "synthetic-foreign-school";
assert.throws(() => validateWorkbook(spanForeign, legacySpan, "school", 1), e => e.status === 403);
const spanStale = structuredClone(retainedSpan);
spanStale.metadata["Base Working Revision"] = 0;
assert.throws(() => validateWorkbook(spanStale, legacySpan, "school", 1), e => e.code === "REVISION_CONFLICT");
const aliasSpan = { ...structuredClone(spanDoc), reporting: {
  parents: {}, officers: { [spanTeacher.id]: spanSupport.id },
  staff: [{ id: spanNoEO.id, name: spanNoEO.name, ro: spanTeacher.id }],
} };
const aliasBook = exportWorkbook(aliasSpan, "Span of Control", "school", 1);
assert.equal(aliasBook.sheets.Hierarchy.rows.find(row => row[0] === spanTeacher.id)[2], spanSupport.id,
  "empty parents must not hide legacy officer links");
assert.equal(aliasBook.sheets.Hierarchy.rows.find(row => row[0] === spanNoEO.id)[2], spanTeacher.id,
  "staff.ro remains a per-person fallback");
const aliasRoundTrip = validateWorkbook(aliasBook, aliasSpan, "school", 1).document.reporting;
assert.deepEqual(aliasRoundTrip.officers, aliasSpan.reporting.officers);
assert.equal(aliasRoundTrip.staff.find(row => row.id === spanNoEO.id).ro, spanTeacher.id);
const conflictingSpan = structuredClone(aliasSpan);
conflictingSpan.reporting.parents = { [spanTeacher.id]: spanLeader.id };
const conflictingBook = exportWorkbook(conflictingSpan, "Span of Control", "school", 1);
assert.equal(conflictingBook.metadata["Conflicting Reporting Staff IDs"], spanTeacher.id);
const untouchedConflict = validateWorkbook(conflictingBook, conflictingSpan, "school", 1).document.reporting;
assert.equal(untouchedConflict.parents[spanTeacher.id], spanLeader.id);
assert.equal(untouchedConflict.officers[spanTeacher.id], spanSupport.id,
  "importing an unchanged workbook must not resolve an unrelated alias conflict");
const unrelatedEdit = structuredClone(conflictingBook);
unrelatedEdit.sheets.Hierarchy.rows.find(row => row[0] === spanSAT.id)[2] = spanSupport.id;
const retainedConflict = validateWorkbook(unrelatedEdit, conflictingSpan, "school", 1).document.reporting;
assert.equal(retainedConflict.parents[spanSAT.id], spanSupport.id);
assert.equal(retainedConflict.officers[spanSAT.id], spanSupport.id);
assert.equal(retainedConflict.officers[spanTeacher.id], spanSupport.id);
assert.equal(retainedConflict.parents[spanTeacher.id], spanLeader.id);
assert.deepEqual(spanDoc, beforeSpan);

const planningExportTeacher = person("planning-export-teacher", "Synthetic Planning Export", { Role: "P", Active: "N" });
planningExportTeacher.active = false;
planningExportTeacher.authority.schoolLeader.value = true;
planningExportTeacher.planningProfile = { Role: "Teacher", Active: "Y" };
const planningExportDoc = { ...defaults(), id: "synthetic-planning-export", name: "Synthetic planning export",
  revision: 1, teachers: [planningExportTeacher] };
const planningTeacherBook = exportWorkbook(planningExportDoc, "Teachers", "school", 1),
  teacherColumns = planningTeacherBook.sheets.Teachers.columns;
assert.equal(planningTeacherBook.sheets.Teachers.rows[0][teacherColumns.indexOf("Role")], "Teacher");
assert.equal(planningTeacherBook.sheets.Teachers.rows[0][teacherColumns.indexOf("Active")], true);
assert.equal(exportWorkbook(planningExportDoc, "Membership", "school", 1).sheets.Membership.rows[0][2], "Teacher");
const planningRoundTrip = validateWorkbook(planningTeacherBook, planningExportDoc, "school", 1);
assert(!planningRoundTrip.proposals.some(row => ["Role", "Active"].includes(row.field)),
  "untouched export/import must not convert accepted P/N back into a draft edit or revert version Teacher/Y");
assert.deepEqual(planningRoundTrip.document.teachers[0].planningProfile, { Role: "Teacher", Active: "Y" });
assert.deepEqual(planningRoundTrip.document.teachers[0].authority, planningExportTeacher.authority);
assert.equal(planningRoundTrip.document.teachers[0].profile.Role, "P");
assert.equal(planningRoundTrip.document.teachers[0].active, false);
const draftExportDoc = { ...structuredClone(planningExportDoc), teacherDrafts: {
  [planningExportTeacher.id]: { Role: "Synthetic draft role", Active: "N" },
} };
const draftTeacherBook = exportWorkbook(draftExportDoc, "Teachers", "school", 1);
assert.equal(draftTeacherBook.sheets.Teachers.rows[0][teacherColumns.indexOf("Role")], "Synthetic draft role");
assert.equal(draftTeacherBook.sheets.Teachers.rows[0][teacherColumns.indexOf("Active")], false);
assert.equal(exportWorkbook(draftExportDoc, "Membership", "school", 1).sheets.Membership.rows[0][2], "Synthetic draft role");
assert.deepEqual(validateWorkbook(draftTeacherBook, draftExportDoc, "school", 1).document.teacherDrafts,
  draftExportDoc.teacherDrafts, "explicit version draft values retain priority through round-trip");
const unknownExportDoc = structuredClone(planningExportDoc);
unknownExportDoc.teachers[0].planningProfile.Active = null;
const unknownTeacherBook = exportWorkbook(unknownExportDoc, "Teachers", "school", 1);
assert.equal(unknownTeacherBook.sheets.Teachers.rows[0][teacherColumns.indexOf("Active")], null);
assert(!validateWorkbook(unknownTeacherBook, unknownExportDoc, "school", 1).proposals.some(row => row.field === "Active"));
for (const value of [true, false]) {
  const explicitActivity = structuredClone(unknownTeacherBook);
  explicitActivity.sheets.Teachers.rows[0][teacherColumns.indexOf("Active")] = value;
  assert.equal(validateWorkbook(explicitActivity, unknownExportDoc, "school", 1).document
    .teacherDrafts[planningExportTeacher.id].Active, value);
}
const invalidActivityClear = structuredClone(planningTeacherBook);
invalidActivityClear.sheets.Teachers.rows[0][teacherColumns.indexOf("Active")] = null;
assert.throws(() => validateWorkbook(invalidActivityClear, planningExportDoc, "school", 1), /TRUE or FALSE/);

const badVenue = exportWorkbook(d, "IP", "school", 1);
badVenue.sheets.Classes.rows[0][5] = "unknown-room";
assert.throws(
  () => validateWorkbook(badVenue, d, "school", 1),
  /Unknown venue/,
);
const badSubject = exportWorkbook(d, "IP", "school", 1);
badSubject.sheets.TeachingAssignments.rows[0][2] = "UNKNOWN_SUBJECT";
assert.throws(
  () => validateWorkbook(badSubject, d, "school", 1),
  /Unknown subject/,
);

assert.throws(
  () =>
    applyEdits(socDoc, [
      {
        operation: "setReportingOfficer",
        officer: "staff-root",
        value: "staff-a",
      },
    ]),
  /School Leader root is protected/,
);
const flags = Object.fromEntries(
  ["sl", "sc", "smc", "kp", "tl", "sdt", "cmt", "sat", "support", "mk"].map(
    (k) => [k, k === "smc"],
  ),
);
const catalogueProjection = {
  ...projection,
  catalogues: [
    {
      catalogueId: "roles",
      revision: "1",
      kind: "membership-role",
      entries: [
        {
          code: "HOD",
          label: "Head of Department",
          active: true,
          definitionRevision: "1",
          flags,
          eoAppointment: null,
        },
      ],
    },
    {
      catalogueId: "hr",
      revision: "1",
      kind: "hr-term",
      entries: [
        {
          code: "EO",
          label: "Education Officer",
          active: true,
          definitionRevision: "1",
          category: "eoAppointmentLevel",
        },
      ],
    },
  ],
};
const withCatalogues = mergeContacts(d, catalogueProjection);
assert.deepEqual(withCatalogues.hrTerms["EO Appt Level"], ["EO"]);
assert.deepEqual(
  withCatalogues.membership,
  [],
  "the retired role-flag matrix must not contain staff facts",
);
assert.deepEqual(withCatalogues.contactsMemberships[0], [
  "staff-a",
  "Alpha",
  "",
  "",
]);
assert(
  !withCatalogues.contactsFacts.some((row) => row[3] === "HOD"),
  "unassigned historical definitions do not become current staff facts",
);
assert.equal(
  withCatalogues.teachers[0].authority.smc.value,
  false,
  "A display catalogue flag never grants authority.",
);
assert.deepEqual(
  exportWorkbook(withCatalogues, "Membership", "school", 1).sheets.Membership
    .rows[0],
  ["staff-a", "Alpha", "", ""],
);
// Real Contacts purpose projections carry selected accepted records, not a
// preconstructed Deploy profile. Blank appointment is distinct from EO status.
const acceptedField = (value) => ({
  state: "accepted",
  effective: true,
  value,
  revision: 1,
  validFrom: null,
  validUntil: null,
  revoked: false,
});
const selectedPerson = (staffId, overrides = {}) => ({
  staffId,
  basicName: "Shared",
  ttbName: "Shared (BT)",
  active: true,
  fields: Object.fromEntries(
    Object.entries({
      role: "",
      eoAppointmentLevel: "",
      appointmentStatus: "",
      employmentActive: true,
      schoolSection: { code: "primary" },
      employmentArrangement: "",
      employmentTags: [],
      subjectTags: [],
      mkTags: [],
      memberships: [],
      eo: true,
      smc: false,
      schoolLeader: false,
      ...overrides,
    }).map(([key, value]) => [key, acceptedField(value)]),
  ),
});
const selectedProjection = {
  ...projection,
  staff: [
    selectedPerson("staff-a"),
    selectedPerson("staff-b", { employmentActive: false }),
  ],
};
const selected = mergeContacts(d, selectedProjection);
assert.equal(
  selected.teachers[0].teachingEligibility?.state,
  "eligible",
  "Selected accepted Contacts facts must supply usable teaching eligibility.",
);
assert.equal(selected.teachers[1].teachingEligibility?.state, "excluded");
assert.equal(selected.teachers[0].profile["EO Appt Level"], "");
assert.equal(selected.teachers[0].name, "Shared (BT)");
assert.equal(
  selected.teachers[1].active,
  false,
  "Selected accepted activity wins over a stale top-level convenience flag.",
);

// Identity inventory is broader than the set eligible for new teaching work.
const eligibilityCases = [
  ["inactive", { employmentActive: false }, "excluded"],
  ["non-eo", { eo: false }, "excluded"],
  ["mk", { schoolSection: { code: "MK" } }, "excluded"],
  ["mke", { schoolSection: { code: "MKE" } }, "excluded"],
  ["support", { role: "Support" }, "excluded"],
  ["school-leader", { eoAppointmentLevel: "SL" }, "excluded"],
  ["unknown-section", { schoolSection: null }, "unavailable"],
  ["unknown-active", { employmentActive: null }, "unavailable"],
  ["malformed-section", { schoolSection: { code: 7 } }, "unavailable"],
  ["missing-section-code", { schoolSection: {} }, "unavailable"],
];
for (const [label, overrides, state] of eligibilityCases) {
  const ref = {
    ...selectedProjection,
    staff: [selectedPerson("staff-a", overrides)],
  };
  assert.equal(
    mergeContacts(d, ref).teachers[0].teachingEligibility.state,
    state,
    label,
  );
  const added = structuredClone(d);
  added.assignments.push({
    id: "new-" + label,
    teacher: "staff-a",
    target: "2T",
    targetRef: "class-b",
    subject: "Math",
    level: "2",
  });
  if (["mk", "mke", "support"].includes(label))
    assert.throws(
      () => validateTeachingBindings(d, added, ref),
      (e) => e.code === "TEACHING_ELIGIBILITY_REQUIRED",
      label,
    );
  else
    assert.equal(validateTeachingBindings(d, added, ref).assignments.length, added.assignments.length,
      "Explicit version activity governs planning; optional/current Contacts facts remain separate: " + label);
  assert.equal(
    validateTeachingBindings(d, d, ref),
    d,
    "An unchanged historical reference never requires current eligibility.",
  );
}
for (const [label, change] of [
  ["version-inactive", teacher => { teacher.profile.Active = "N"; teacher.active = false; }],
  ["version-unknown", teacher => { delete teacher.profile.Active; teacher.activeKnown = false; delete teacher.active; }],
]) {
  const before = structuredClone(d);
  change(before.teachers[0]);
  const added = structuredClone(before);
  added.assignments.push({ id: "new-" + label, teacher: "staff-a", target: "2T",
    targetRef: "class-b", subject: "Math", level: "2" });
  assert.throws(() => validateTeachingBindings(before, added, selectedProjection),
    e => e.code === "TEACHING_ELIGIBILITY_REQUIRED", label);
}
const versionLeader = { ...structuredClone(d), roleMembershipSchema: 1,
  membership: [["Version Leader", "Synthetic version leader", "1", ...Array(9).fill(""), "", null]],
  teacherDrafts: { "staff-a": { Role: "Version Leader" } },
};
const assignedLeader = structuredClone(versionLeader);
assignedLeader.assignments.push({ id: "new-version-leader", teacher: "staff-a", target: "2T",
  targetRef: "class-b", subject: "Math", level: "2" });
assert.throws(() => validateTeachingBindings(versionLeader, assignedLeader, selectedProjection),
  e => e.code === "TEACHING_ELIGIBILITY_REQUIRED", "explicit version SL classification excludes new teaching assignments");
for (const invalid of [
  { state: "pending" },
  { effective: false },
  { revoked: true },
  { validFrom: projection.asOf + 1 },
  { validUntil: projection.asOf },
]) {
  const ref = structuredClone(selectedProjection);
  Object.assign(ref.staff[0].fields.eo, invalid);
  assert.equal(
    mergeContacts(d, ref).teachers[0].teachingEligibility.state,
    "unavailable",
  );
}
const missingWorkloadOnly = structuredClone(selectedProjection);
for (const field of [
  "employmentArrangement",
  "appointmentStatus",
  "subjectTags",
])
  delete missingWorkloadOnly.staff[0].fields[field];
const selectableWithoutWorkload = mergeContacts(d, missingWorkloadOnly)
  .teachers[0];
assert.equal(selectableWithoutWorkload.teachingEligibility.state, "eligible");
assert.equal(
  selectableWithoutWorkload.quality,
  "unavailable",
  "Selection evidence does not fabricate missing workload facts.",
);
for (const field of [
  "role",
  "eoAppointmentLevel",
  "employmentTags",
  "mkTags",
  "memberships",
]) {
  const missingExclusion = structuredClone(selectedProjection);
  delete missingExclusion.staff[0].fields[field];
  assert.equal(
    mergeContacts(d, missingExclusion).teachers[0].teachingEligibility.state,
    "eligible",
    "Optional classification absence cannot negate explicit active/EO/primary: " +
      field,
  );
}
const knownMembership = selectedPerson("staff-a", {
  memberships: [{ code: "Support" }],
});
knownMembership.groups = [];
assert.equal(
  mergeContacts(d, { ...selectedProjection, staff: [knownMembership] })
    .teachers[0].teachingEligibility.state,
  "excluded",
  "Accepted memberships govern negative teaching exclusions, not stale flattened groups.",
);
knownMembership.fields.memberships = acceptedField([]);
knownMembership.groups = ["SL"];
knownMembership.fields.schoolLeader = acceptedField(true);
assert.equal(
  mergeContacts(d, { ...selectedProjection, staff: [knownMembership] })
    .teachers[0].teachingEligibility.state,
  "eligible",
  "Stale compatibility groups cannot override accepted facts; SL=true adds no new exclusion policy.",
);
const ordinaryTeacher = selectedPerson("staff-a");
ordinaryTeacher.fields.role = { state: "superseded", effective: false };
ordinaryTeacher.fields.eoAppointmentLevel = {
  state: "missing",
  effective: false,
};
ordinaryTeacher.fields.appointmentStatus = {
  state: "missing",
  effective: false,
};
const ordinaryProjection = { ...selectedProjection, staff: [ordinaryTeacher] };
const ordinary = mergeContacts(d, ordinaryProjection).teachers[0];
assert.equal(ordinary.teachingEligibility.state, "eligible");
assert.equal(ordinary.profile.Role, "");
assert.equal(ordinary.profile["EO Appt Level"], "");
assert.equal(
  ordinary.quality,
  "unavailable",
  "Explicit EO eligibility does not fabricate optional classification evidence.",
);
const incompleteNonTeacher = selectedPerson("nonteacher", { eo: false });
delete incompleteNonTeacher.fields.employmentArrangement;
delete incompleteNonTeacher.fields.role;
const withNonTeacher = {
  ...selectedProjection,
  staff: [
    selectedPerson("staff-a"),
    selectedPerson("staff-b"),
    incompleteNonTeacher,
  ],
};
assert.equal(
  calculate(d, withNonTeacher).rows.find((r) => r.staffId === "staff-a")
    .quality,
  "verified",
  "An explicitly excluded non-teacher cannot poison other teachers' workload quality.",
);
const orphan = mergeContacts(d, { ...selectedProjection, staff: [] });
assert.equal(orphan.teachers.length, d.teachers.length);
assert.equal(orphan.teachers[0].teachingEligibility.state, "unavailable");
assert.equal(orphan.teachers[0].orphan, true);

const inactiveProjection = {
  ...selectedProjection,
  staff: [
    selectedPerson("staff-a", { employmentActive: false }),
    selectedPerson("staff-b", { employmentActive: false }),
  ],
};
const legacy = structuredClone(d);
delete legacy.assignments.find((a) => a.id === "assign-ft").targetRef;
const renamedWorkbook = exportWorkbook(legacy, "IP", "school", 1);
renamedWorkbook.sheets.Classes.rows[0][2] = "Renamed";
renamedWorkbook.sheets.Classes.rows[0][3] = "R";
const renamedImport = validateWorkbook(
  renamedWorkbook,
  canonicalTeachingDocument(legacy),
  "school",
  1,
).document;
assert.equal(
  renamedImport.assignments.find((a) => a.subject === "FT").id,
  "assign-ft",
);
assert.deepEqual(changedTeachingStaff(legacy, renamedImport), []);
assert.equal(
  validateTeachingBindings(legacy, renamedImport, inactiveProjection),
  renamedImport,
);
assert.equal(
  legacy.assignments.find((a) => a.id === "assign-ft").targetRef,
  undefined,
  "Private import normalization must not mutate stored historical evidence.",
);
// These mutations must still recheck planning eligibility. The owner now makes
// explicit version Active authoritative for that check, independently of the
// current accepted Contacts activity used for Roster/Core facts.
const versionInactivePlan = { ...structuredClone(d), teacherDrafts: {
  "staff-a": { Active: "N" }, "staff-b": { Active: "N" },
} };
for (const mutate of [
  (next) => {
    next.assignments[0].teacher = "staff-b";
  },
  (next) => {
    next.assignments[0].subject = "Math";
  },
  (next) => {
    Object.assign(next.assignments[0], { target: "2T", targetRef: "class-b" });
  },
  (next) => {
    next.groups[0].levels = ["2"];
    next.groups[0].level = "2";
    next.groups[0].classRefs = ["class-b"];
  },
  (next) => {
    next.groups[0].subject = "Art";
  },
  (next) => {
    next.groups[0].levelWide = true;
    next.groups[0].classRefs = [];
  },
]) {
  const next = structuredClone(versionInactivePlan);
  mutate(next);
  assert(changedTeachingStaff(versionInactivePlan, next).length > 0);
  assert.throws(
    () => validateTeachingBindings(versionInactivePlan, next, inactiveProjection),
    (e) => e.code === "TEACHING_ELIGIBILITY_REQUIRED",
  );
}
const legacyGroupPlan = structuredClone(d);
Object.assign(legacyGroupPlan.groups[0], { form: "1P", sources: ["1P"] });
delete legacyGroupPlan.groups[0].classRefs;
const unrelatedLegacyNote = applyEdits(legacyGroupPlan, [
  { operation: "setTeacherNote", teacher: "staff-b", value: "Unrelated note" },
]);
assert.deepEqual(unrelatedLegacyNote.groups, legacyGroupPlan.groups);
assert.deepEqual(unrelatedLegacyNote.assignments, legacyGroupPlan.assignments);
const renamedLegacyGroup = applyEdits(legacyGroupPlan, [
  {
    operation: "updateClass",
    ref: "class-a",
    level: "1",
    name: "Renamed",
    shortName: "R",
  },
]);
assert.deepEqual(changedTeachingStaff(legacyGroupPlan, renamedLegacyGroup), []);
assert.deepEqual(renamedLegacyGroup.groups[0].classRefs, ["class-a"]);
assert.equal(renamedLegacyGroup.groups[0].anchorRef, "class-a");
assert.equal(legacyGroupPlan.groups[0].classRefs, undefined);
assert.equal(
  validateTeachingBindings(
    legacyGroupPlan,
    renamedLegacyGroup,
    inactiveProjection,
  ),
  renamedLegacyGroup,
);
const rawRename = structuredClone(legacyGroupPlan);
rawRename.classes[0].shortName = "R";
assert.deepEqual(changedTeachingStaff(legacyGroupPlan, rawRename), []);
const repointedLegacyGroup = structuredClone(rawRename);
repointedLegacyGroup.groups[0].form = "2T";
repointedLegacyGroup.groups[0].sources = ["2T"];
repointedLegacyGroup.groups[0].level = "2";
repointedLegacyGroup.groups[0].levels = ["2"];
assert.deepEqual(changedTeachingStaff(legacyGroupPlan, repointedLegacyGroup), [
  "staff-b",
]);
assert.throws(
  () =>
    validateTeachingBindings(
      { ...legacyGroupPlan, teacherDrafts: { "staff-b": { Active: "N" } } },
      { ...repointedLegacyGroup, teacherDrafts: { "staff-b": { Active: "N" } } },
      inactiveProjection,
    ),
  (e) => e.code === "TEACHING_ELIGIBILITY_REQUIRED",
);
const removed = structuredClone(d);
removed.assignments = [];
assert.deepEqual(changedTeachingStaff(d, removed), []);
const renamedTg = structuredClone(d);
renamedTg.groups[0].name = "Display only";
assert.deepEqual(changedTeachingStaff(d, renamedTg), []);
assert.throws(
  () => validateTeachingBindings(versionInactivePlan, versionInactivePlan, inactiveProjection, ["staff-a"]),
  (e) => e.code === "TEACHING_ELIGIBILITY_REQUIRED",
  "Explicit Add existing must not reactivate a version-inactive teacher.",
);
const explicitlyAvailable = validateTeachingBindings(d, d, inactiveProjection, ["staff-a"]);
assert.equal(explicitlyAvailable.teachers.find(t => t.id === "staff-a").active, false,
  "version planning eligibility never reactivates the accepted Contacts employment record");
assert.equal(explicitlyAvailable.teachers.find(t => t.id === "staff-a").planningProfile.Active, "Y");
const fresh = structuredClone(d);
fresh.assignments.push({
  id: "new-eligible",
  target: "2T",
  targetRef: "class-b",
  teacher: "staff-a",
  subject: "Math",
  level: "2",
});
assert.equal(
  validateTeachingBindings(d, fresh, withNonTeacher).assignments.length,
  d.assignments.length + 1,
);
console.log(
  "PASS Contacts selected-fact eligibility matrix, non-teacher isolation, retained identities and stable IP/FT/TG binding comparisons",
);

const ascSettings = AscExport.defaults(d);
const ascSaved = applyEdits(d, [
  { operation: "setAscExportSettings", expected: {}, value: ascSettings },
]);
assert.deepEqual(ascSaved.ascExport, AscExport.validateSettings(ascSettings));
console.log(
  "PASS Deploy canonical workbook scope, negative inputs, immutable drafts and TV01 workload semantics",
);
