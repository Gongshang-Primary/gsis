import assert from "node:assert/strict";
import AscExport from "../shared/asc-export.js";
import {
  defaults,
  applyEdits,
  calculate,
  mergeContacts,
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
const readonly = exportWorkbook(d, "Membership", "school", 1);
assert.throws(
  () => validateWorkbook(readonly, d, "school", 1),
  (e) => e.code === "REFERENCE_ONLY",
);
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
assert.equal(withCatalogues.membership[0][4], "1");
assert.equal(
  withCatalogues.teachers[0].authority.smc.value,
  false,
  "A display catalogue flag never grants authority.",
);
assert.equal(
  exportWorkbook(withCatalogues, "Membership", "school", 1).sheets.Membership
    .rows[0][4],
  true,
);
const ascSettings = AscExport.defaults(d);
const ascSaved = applyEdits(d, [
  { operation: "setAscExportSettings", expected: {}, value: ascSettings },
]);
assert.deepEqual(ascSaved.ascExport, AscExport.validateSettings(ascSettings));
console.log(
  "PASS Deploy canonical workbook scope, negative inputs, immutable drafts and TV01 workload semantics",
);
