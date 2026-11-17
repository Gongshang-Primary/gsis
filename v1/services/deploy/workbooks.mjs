import {
  check,
  id,
  text,
  finite,
  nullable,
  bool,
  unique,
  isRecord,
  plain,
} from "./validation.mjs";
import { membershipValue, setMembershipValue } from "./model.mjs";
import { ROLE_COLUMNS, normalizeRoleMemberships, applyRoleMemberships, checkManagedMemberships, roleMapping } from "./role-memberships.mjs";
import { HR_CHOICE_FIELDS, choiceLists, normalizeHRChoices, applyCatalogueLinks } from "./catalogue-links.mjs";
import { planningPerson, reportingStaff, reportingLinks, reportingRoot, reportingConflicts } from "../../web/shared/deploy-eligibility.mjs";
export const SCHEMAS = Object.freeze({
  IP: {
    Classes: [
      "Class ID",
      "Level",
      "Class Name",
      "Short Name",
      "Ability",
      "Venue ID",
    ],
    FormTeachers: ["Class ID", "Staff ID", "TTb Name"],
    TeachingAssignments: [
      "Assignment ID",
      "Class ID",
      "Subject Code",
      "Staff ID",
      "TTb Name",
    ],
  },
  TG: {
    TeachingGroups: [
      "TG ID",
      "TG Name",
      "Subject Code",
      "Levels",
      "Weekly Periods",
      "Venue ID",
      "Whole Level",
      "Anchor Class ID",
    ],
    TGClasses: ["TG ID", "Class ID"],
    TGTeachers: ["Assignment ID", "TG ID", "Staff ID", "TTb Name"],
  },
  Dept: {
    Departments: ["Department ID", "Department Name"],
    DepartmentMembers: [
      "Department ID",
      "Staff ID",
      "TTb Name",
      "Position",
      "Order",
    ],
  },
  Teachers: {
    Teachers: [
      "Staff ID",
      "TTb Name",
      "Basic Name",
      "Role",
      "EO Appt Level",
      "Appointment Status",
      "Employment Modifier",
      "Subject Modifier",
      "Active",
      "Planner Notes",
    ],
  },
  Exclusions: {
    Exclusions: ["Staff ID", "TTb Name", "P1", "P2", "P3", "P4", "P5", "P6"],
  },
  "Role Membership": { "Role Membership": ROLE_COLUMNS },
  Membership: { Membership: ["Staff ID", "TTb Name", "Role", "Memberships"] },
  Offload: {
    Offload: [
      "Rule ID",
      "Rule Name",
      "Source",
      "Match",
      "Standard Percent",
      "Acting Percent",
      "Period Cap",
      "Notes",
    ],
  },
  "HR Terms": { "HR Terms": ["Field", "Choices — one per line"] },
  "Span of Control": {
    Hierarchy: [
      "Staff ID",
      "Staff Name",
      "Parent RO Staff ID",
      "Parent RO Name",
      "Role",
      "Is SL",
      "Is OSO",
      "Active",
    ],
  },
});
export const PROPOSABLE = [
  "Basic Name",
  "Role",
  "Appointment Status",
  "Employment Modifier",
  "Subject Modifier",
  "Active",
];
const key = (c) => c.ref || c.id;
const classCode = (c) =>
  String(c.level) +
  (String(c.shortName).startsWith(String(c.level))
    ? String(c.shortName).slice(String(c.level).length)
    : c.shortName);
const display = (t) => t.ttbName || t.profile?.["TTb Name"] || t.name || t.id;
const entry = (columns, rows) => ({ columns, rows });
export function exportWorkbook(
  doc,
  scope,
  schoolId,
  revision,
  { visible = false, staffIds = null } = {},
) {
  check(SCHEMAS[scope], "Unknown table scope.");
  const teachers = new Map(doc.teachers.map((t) => [t.id, t]));
  const classes = new Map(doc.classes.map((c) => [classCode(c), c]));
  const groups = new Set(doc.groups.map((g) => g.id));
  let sheets = {}, historicalReportingIds = [], conflictingReportingIds = [];
  if (scope === "IP")
    sheets = {
      Classes: doc.classes.map((c) => [
        key(c),
        Number(c.level),
        c.name,
        c.shortName,
        c.ability || "",
        c.venueId ||
          doc.venues.find(
            (v) => v.form === classCode(c) || v.forms?.includes(classCode(c)),
          )?.id ||
          "",
      ]),
      FormTeachers: doc.assignments
        .filter((a) => a.subject === "FT" && !groups.has(a.target))
        .map((a) => [
          a.targetRef || key(classes.get(a.target) || {}),
          a.teacher,
          display(teachers.get(a.teacher) || { id: a.teacher }),
        ]),
      TeachingAssignments: doc.assignments
        .filter((a) => a.subject !== "FT" && !groups.has(a.target))
        .map((a) => [
          a.id,
          a.targetRef || key(classes.get(a.target) || {}),
          a.subject,
          a.teacher,
          display(teachers.get(a.teacher) || { id: a.teacher }),
        ]),
    };
  if (scope === "TG")
    sheets = {
      TeachingGroups: doc.groups.map((g) => [
        g.id,
        g.name,
        g.subject,
        (g.levels || [g.level]).join(";"),
        g.weeklyPeriods ?? null,
        g.venue || "",
        !!g.levelWide,
        g.anchorRef || "",
      ]),
      TGClasses: doc.groups.flatMap((g) =>
        (g.classRefs || []).map((c) => [g.id, c]),
      ),
      TGTeachers: doc.assignments
        .filter((a) => groups.has(a.target))
        .map((a) => [
          a.id,
          a.target,
          a.teacher,
          display(teachers.get(a.teacher) || { id: a.teacher }),
        ]),
    };
  if (scope === "Dept") {
    const depts = doc.organisations?.dept || [];
    sheets = {
      Departments: depts.map((d) => [d.id, d.name]),
      DepartmentMembers: depts.flatMap((d) =>
        [
          (d.slots || []).map((s, i) => [
            s,
            i === 0 ? "Head" : i === 1 ? "Deputy" : "Member",
            i,
          ]),
          (d.additionalDeputies || []).map((s, i) => [s, "Deputy", i + 1]),
          (d.tls || []).map((s, i) => [s, "TL", i]),
        ]
          .flat()
          .filter((x) => x[0])
          .map(([s, p, o]) => [
            d.id,
            s,
            display(teachers.get(s) || { id: s }),
            p,
            o,
          ]),
      ),
    };
  }
  if (scope === "Teachers")
    sheets = {
      Teachers: doc.teachers.map((t) => {
        const planned = planningPerson(doc, t);
        return [
          t.id,
          display(t),
          ...[
            "Basic Name",
            "Role",
            "EO Appt Level",
            "Appointment Status",
            "Employment Modifier",
            "Subject Modifier",
          ].map(
            (k) =>
              doc.teacherDrafts?.[t.id]?.[k] ??
              (k === "Role" ? planned.profile.Role : t.profile?.[k]) ??
              (k === "Basic Name" ? t.name : ""),
          ),
          planned.activeKnown ? planned.active : null,
          doc.teacherNotes?.[t.id] || "",
        ];
      }),
    };
  if (scope === "Exclusions")
    sheets = {
      Exclusions: doc.teachers.map((t) => [
        t.id,
        display(t),
        ...["1", "2", "3", "4", "5", "6"].map((l) =>
          (
            doc.levelExclusions.find((x) => x.teacher === t.id)?.levels || []
          ).includes(l),
        ),
      ]),
    };
  if (scope === "Role Membership")
    sheets = { "Role Membership": normalizeRoleMemberships(doc.membership || []) };
  if (scope === "Membership")
    sheets = {
      Membership: doc.teachers.map((teacher) => [teacher.id, display(teacher),
        planningPerson(doc, teacher).profile.Role || "", (membershipValue(teacher) || []).join("\n")]),
    };
  if (scope === "Offload")
    sheets = {
      Offload: (doc.offload?.tags || []).map((r) => [
        r.id,
        r.name,
        r.source,
        r.match,
        r.percent === "" ? null : r.percent,
        r.actingPercent === "" ? null : r.actingPercent,
        r.periods === "" ? null : r.periods,
        r.notes || "",
      ]),
    };
  if (scope === "HR Terms")
    sheets = {
      "HR Terms": HR_CHOICE_FIELDS.map(field => [field, choiceLists(doc)[field].join("\n")]),
    };
  if (scope === "Span of Control") {
    const parents = reportingLinks(doc),
      eligible = reportingStaff(doc, { retainHistorical: true }),
      eligibleIds = new Set(eligible.map((t) => t.id)),
      reportingPeople = new Map(eligible.map(t => [t.id, t]));
    historicalReportingIds = eligible.filter(t => t.historical).map(t => t.id);
    conflictingReportingIds = reportingConflicts(doc).map(t => t.id);
    const officers = [
      ...new Set([
        ...(doc.reporting?.roColumnIds || []),
        ...eligible
          .filter((t) => reportingRoot(doc, t))
          .map((t) => t.id),
        ...Object.values(parents).filter(Boolean),
      ]),
    ].filter((s) => eligibleIds.has(s));
    sheets.Hierarchy = eligible.map((t) => [
      t.id,
      display(t),
      parents[t.id] || "",
      display(reportingPeople.get(parents[t.id]) || { id: "" }),
      t.profile?.Role || "",
      reportingRoot(doc, t),
      t.profile?.Role === "OSO",
      t.active === true,
    ]);
    const columns = [
      ...officers.map((o) => `${display(reportingPeople.get(o) || { id: o })} [${o}]`),
      "Unassigned",
    ];
    const lists = [...officers, ""].map((o) =>
      eligible
        .filter((t) => (parents[t.id] || "") === o)
        .map((t) => `${display(t)} [${t.id}]`),
    );
    const n = Math.max(0, ...lists.map((l) => l.length));
    sheets["RO Columns"] = entry(
      columns,
      Array.from({ length: n }, (_, i) => lists.map((l) => l[i] || "")),
    );
  }
  const result = {
    schemaVersion: 1,
    metadata: {
      "School ID": schoolId,
      "Version ID": doc.id,
      "Base Working Revision": revision,
      "Table Scope": scope,
      "Schema Version": 1,
      mode: visible ? "reporting-only" : "importable",
      ...(scope === "Membership" ? { Instructions:
        "Use one membership per line. Blank clears an existing list; an untouched unknown blank remains unknown. Use the Memberships screen to explicitly save an unknown list as empty. Staff IDs identify existing rows; omitted rows remain unchanged." } : {}),
      ...(scope === "Span of Control" ? {
        Instructions: "Available active version staff are included immediately. Retained historical reporting rows may keep their existing relationship or be explicitly cleared; they cannot form new relationships. Conflicting legacy aliases remain unchanged until that staff relationship is explicitly changed. Only Parent RO Staff ID is editable in Hierarchy.",
        "Historical Reporting Staff IDs": historicalReportingIds.join("\n"),
        "Conflicting Reporting Staff IDs": conflictingReportingIds.join("\n"),
      } : {}),
    },
    sheets: Object.fromEntries(
      Object.entries(sheets).map(([s, rows]) => [
        s,
        isRecord(rows) ? rows : entry(SCHEMAS[scope][s], rows),
      ]),
    ),
  };
  if (staffIds) {
    const ids = new Set(staffIds);
    for (const [name, sheet] of Object.entries(result.sheets)) {
      const i = sheet.columns.indexOf("Staff ID");
      if (i >= 0) sheet.rows = sheet.rows.filter((r) => ids.has(r[i]));
    }
    result.metadata.mode = "reporting-only";
  }
  return result;
}
function records(wb, scope) {
  const out = {};
  check(isRecord(wb.sheets), "Missing sheets.");
  const expected = Object.keys(SCHEMAS[scope]).concat(
    scope === "Span of Control" ? ["RO Columns"] : [],
  );
  check(
    Object.keys(wb.sheets).length === expected.length &&
      expected.every((k) => Object.hasOwn(wb.sheets, k)),
    "Workbook sheets must match the selected scope exactly.",
  );
  for (const name of expected) {
    const sheet = wb.sheets[name];
    check(
      isRecord(sheet) &&
        Array.isArray(sheet.columns) &&
        Array.isArray(sheet.rows) &&
        sheet.rows.length <= 3000,
      "Invalid sheet or row bound.",
    );
    const columns = SCHEMAS[scope][name];
    if (columns)
      check(
        JSON.stringify(sheet.columns) === JSON.stringify(columns),
        "Column order does not match " + name + ".",
      );
    check(
      sheet.rows.every(
        (row) => Array.isArray(row) && row.length === sheet.columns.length,
      ),
      "Invalid row width.",
    );
    out[name] = sheet.rows.map((row) =>
      Object.fromEntries(sheet.columns.map((c, i) => [c, row[i]])),
    );
  }
  return out;
}
export function validateWorkbook(
  wb,
  doc,
  schoolId,
  revision,
  { matches = {} } = {},
) {
  plain(wb);
  const m = wb.metadata;
  check(
    isRecord(m) && wb.schemaVersion === 1 && m["Schema Version"] === 1,
    "Unsupported workbook schema.",
  );
  check(
    m["School ID"] === schoolId && m["Version ID"] === doc.id,
    "Workbook belongs to another school or version.",
    "SCHOOL_MISMATCH",
    403,
  );
  check(
    m.mode === "importable",
    "Reporting-only exports cannot replace a table.",
  );
  check(
    m["Base Working Revision"] === revision,
    "Workbook base changed.",
    "REVISION_CONFLICT",
    409,
  );
  const scope = m["Table Scope"];
  check(SCHEMAS[scope], "Unknown scope.");
  const r = records(wb, scope),
    next = structuredClone(doc),
    teacherMap = new Map(doc.teachers.map((t) => [t.id, t])),
    classes = new Map(doc.classes.map((c) => [key(c), c])),
    groups = new Set(doc.groups.map((g) => g.id)),
    proposals = [];
  function staff(row) {
    let s = row["Staff ID"];
    if (!s) {
      const name = row["TTb Name"];
      check(
        typeof matches[name] === "string",
        "Choose a Staff ID for the unmatched TTb name.",
        "TTB_MATCH_REQUIRED",
        409,
      );
      s = matches[name];
    }
    id(s, "Staff ID");
    check(teacherMap.has(s), "Unknown or foreign Staff ID.");
    const name = row["TTb Name"];
    check(
      !name || name === display(teacherMap.get(s)) || matches[name] === s,
      "Staff ID and displayed name conflict; resolve explicitly.",
      "STAFF_NAME_CONFLICT",
      409,
    );
    return s;
  }
  function venueRef(value) {
    if (!value) return "";
    id(value, "Venue ID");
    check(
      doc.venues.some((v) => v.id === value),
      "Unknown venue reference.",
    );
    return value;
  }
  function classRef(value) {
    id(value, "Class ID");
    check(classes.has(value), "Unknown class reference.");
    return value;
  }
  if (scope === "IP") {
    unique(r.Classes, (x) => x["Class ID"], "class");
    const incoming = new Set(r.Classes.map((c) => c["Class ID"]));
    for (const c of doc.classes)
      if (!incoming.has(key(c)))
        check(
          !doc.groups.some(
            (g) => g.classRefs?.includes(key(c)) || g.anchorRef === key(c),
          ),
          "IP replacement would delete a referenced TG class.",
          "DEPENDENCY_CONFLICT",
          409,
        );
    next.classes = r.Classes.map((c) => {
      const ref = id(c["Class ID"], "Class ID");
      check(
        classes.has(ref),
        "New classes require server-issued IDs before import.",
      );
      const old = classes.get(ref);
      check(
        Number(c.Level) === Number(old.level),
        "An existing class level cannot be changed by replacement.",
      );
      return {
        ...old,
        ref,
        level: String(finite(c.Level, 1, 6)),
        name: text(c["Class Name"]),
        shortName: text(c["Short Name"], 40),
        ability: text(c.Ability || "", 80, true),
        venueId: venueRef(c["Venue ID"]),
      };
    });
    unique(next.classes, (c) => classCode(c), "class name");
    const nextByRef = new Map(next.classes.map((c) => [key(c), c]));
    const requireClass = (x) => {
      classRef(x);
      check(nextByRef.has(x), "Assignment references a removed class.");
      return nextByRef.get(x);
    };
    const preserved = doc.assignments.filter((a) => groups.has(a.target));
    const oldAssignments = new Map(doc.assignments.map((a) => [a.id, a]));
    const assignments = r.TeachingAssignments.map((a) => {
      const c = requireClass(a["Class ID"]),
        s = staff(a),
        provided = a["Assignment ID"];
      check(
        a["Subject Code"] !== "FT" &&
          Object.hasOwn(doc.loads[c.level] || {}, a["Subject Code"]),
        "Unknown subject code; form teachers belong in their own sheet.",
      );
      if (provided) {
        id(provided);
        check(
          oldAssignments.has(provided) &&
            !groups.has(oldAssignments.get(provided).target),
          "Invalid supplied assignment ID.",
        );
      }
      return {
        id: provided || crypto.randomUUID(),
        targetRef: key(c),
        target: classCode(c),
        teacher: s,
        subject: text(a["Subject Code"], 60),
        level: c.level,
      };
    });
    const fts = r.FormTeachers.map((a) => {
      const c = requireClass(a["Class ID"]),
        s = staff(a),
        old = doc.assignments.find(
          (x) =>
            x.subject === "FT" &&
            x.teacher === s &&
            (x.targetRef === key(c) || x.target === classCode(c)),
        );
      return {
        id: old?.id || crypto.randomUUID(),
        targetRef: key(c),
        target: classCode(c),
        teacher: s,
        subject: "FT",
        level: c.level,
      };
    });
    unique(
      [...assignments, ...fts],
      (a) => a.target + "|" + a.subject + "|" + a.teacher,
      "assignment",
    );
    unique(fts, (a) => a.teacher, "form teacher");
    unique(assignments, (a) => a.id, "assignment ID");
    next.assignments = [...preserved, ...assignments, ...fts];
  }
  if (scope === "TG") {
    unique(r.TeachingGroups, (g) => g["TG ID"], "TG");
    const oldGroups = new Map(doc.groups.map((g) => [g.id, g]));
    const newGroups = r.TeachingGroups.map((g) => {
      const gid = id(g["TG ID"]);
      check(
        oldGroups.has(gid),
        "New TGs require server-issued IDs before import.",
      );
      const levels = String(g.Levels)
        .split(";")
        .map((s) => String(finite(Number(s), 1, 6)));
      check(
        levels.every((s) => /^[1-6]$/.test(s)) &&
          new Set(levels).size === levels.length,
        "Invalid TG levels.",
      );
      const refs = r.TGClasses.filter((x) => x["TG ID"] === gid).map((x) =>
        classRef(x["Class ID"]),
      );
      const whole = bool(g["Whole Level"]);
      check(
        !whole || refs.length === 0,
        "Whole-level mode cannot also specify class membership.",
      );
      const anchor = g["Anchor Class ID"] ? classRef(g["Anchor Class ID"]) : "";
      check(
        !anchor || refs.includes(anchor) || whole,
        "Anchor is outside TG scope.",
      );
      return {
        ...oldGroups.get(gid),
        id: gid,
        name: text(g["TG Name"]),
        subject: text(g["Subject Code"], 60),
        levels,
        level: levels[0],
        weeklyPeriods: nullable(g["Weekly Periods"]),
        venue: venueRef(g["Venue ID"]),
        levelWide: whole,
        classRefs: refs,
        anchorRef: anchor,
      };
    });
    const map = new Map(newGroups.map((g) => [g.id, g]));
    check(
      r.TGClasses.every((x) => map.has(x["TG ID"])),
      "Unknown TG membership.",
    );
    unique(r.TGClasses, (x) => x["TG ID"] + "|" + x["Class ID"], "TG class");
    const oldAssignments = new Map(doc.assignments.map((a) => [a.id, a]));
    const assignments = r.TGTeachers.map((a) => {
      const g = map.get(a["TG ID"]);
      check(g, "Unknown TG.");
      const aid = a["Assignment ID"];
      if (aid)
        check(
          oldAssignments.has(aid) && groups.has(oldAssignments.get(aid).target),
          "Invalid TG assignment ID.",
        );
      return {
        id: aid || crypto.randomUUID(),
        target: g.id,
        subject: g.subject,
        teacher: staff(a),
        level: g.level,
      };
    });
    unique(assignments, (a) => a.target + "|" + a.teacher, "TG teacher");
    unique(assignments, (a) => a.id, "assignment ID");
    next.groups = newGroups;
    next.assignments = [
      ...doc.assignments.filter((a) => !groups.has(a.target)),
      ...assignments,
    ];
  }
  if (scope === "Dept") {
    unique(r.Departments, (d) => d["Department ID"], "department");
    const map = new Map((doc.organisations?.dept || []).map((d) => [d.id, d]));
    next.organisations ??= {};
    next.organisations.dept = r.Departments.map((d) => {
      const did = id(d["Department ID"]);
      check(
        map.has(did),
        "New departments require server-issued IDs before import.",
      );
      const people = r.DepartmentMembers.filter(
        (m) => m["Department ID"] === did,
      ).map((m) => ({
        id: staff(m),
        role: m.Position,
        order: finite(m.Order, 0, 500),
      }));
      unique(people, (p) => p.id, "department member");
      check(
        people.every((p) =>
          ["Head", "Deputy", "TL", "Member"].includes(p.role),
        ) && people.filter((p) => p.role === "Head").length <= 1,
        "Invalid department positions.",
      );
      const by = (role) =>
        people
          .filter((p) => p.role === role)
          .sort((a, b) => a.order - b.order)
          .map((p) => p.id);
      const deps = by("Deputy");
      return {
        id: did,
        name: text(d["Department Name"]),
        slots: [by("Head")[0] || "", deps[0] || "", ...by("Member")],
        additionalDeputies: deps.slice(1),
        tls: by("TL"),
      };
    });
    check(
      r.DepartmentMembers.every((m) =>
        r.Departments.some((d) => d["Department ID"] === m["Department ID"]),
      ),
      "Unknown department.",
    );
  }
  if (scope === "Teachers") {
    unique(r.Teachers, (t) => t["Staff ID"] || t["TTb Name"], "staff");
    next.teacherNotes ??= {};
    next.teacherDrafts ??= {};
    for (const row of r.Teachers) {
      const s = staff(row),
        t = teacherMap.get(s),
        planned = planningPerson(doc, t);
      const mapping = roleMapping({ ...next, teacherDrafts: { ...next.teacherDrafts,
        [s]: { ...next.teacherDrafts[s], Role: row.Role || "" } } }, t);
      check(
        (row["EO Appt Level"] || "") === (mapping ? mapping[12] : (t.profile?.["EO Appt Level"] || "")),
        "EO appointment level is reference-only.",
      );
      next.teacherNotes[s] = text(row["Planner Notes"] || "", 4000, true);
      for (const field of PROPOSABLE) {
        if (field === "Active" && !planned.activeKnown && [null, undefined, ""].includes(row[field]))
          continue;
        const v =
            field === "Active"
              ? bool(row[field])
              : text(row[field] || "", 160, true),
          base =
            field === "Active"
              ? (planned.activeKnown ? planned.active : null)
              : ((field === "Role" ? planned.profile.Role : t.profile?.[field]) ?? (field === "Basic Name" ? t.name : ""));
        if (v !== base) {
          next.teacherDrafts[s] ??= {};
          next.teacherDrafts[s][field] = v;
          proposals.push({ staffId: s, field, value: v });
        }
      }
    }
  }
  if (scope === "HR Terms") {
    unique(r["HR Terms"], row => row.Field, "HR field");
    check(r["HR Terms"].length === HR_CHOICE_FIELDS.length &&
      r["HR Terms"].every(row => HR_CHOICE_FIELDS.includes(row.Field)), "Supply each HR choice field exactly once.");
    const choices = Object.fromEntries(r["HR Terms"].map(row => {
      const value = row["Choices — one per line"];
      check(value === null || typeof value === "string", "HR choices must be text.");
      return [row.Field, (value || "").split(/\r?\n/).map(item => item.trim()).filter(Boolean)];
    }));
    const validatedChoices = normalizeHRChoices(choices, next);
    next.hrChoices = Object.fromEntries(HR_CHOICE_FIELDS.filter(field =>
      !["Day of Birth", "Month of birth", "Active", "Role"].includes(field)).map(field => [field, validatedChoices[field]]));
    next.hrChoicesSchema = 1;
  }
  if (scope === "Role Membership") {
    next.membership = normalizeRoleMemberships(wb.sheets["Role Membership"].rows);
    next.roleMembershipSchema = 1;
    applyRoleMemberships(next);
  }
  if (scope === "Membership") {
    unique(r.Membership, (row) => row["Staff ID"], "staff");
    for (const row of r.Membership) {
      id(row["Staff ID"], "Staff ID");
      const person = next.teachers.find((teacher) => teacher.id === staff(row)),
        value = row.Memberships;
      check(value === null || typeof value === "string", "Memberships must be text.");
      const blank = value === null || !value.trim();
      if (blank && (membershipValue(person) === undefined || membershipValue(person) === null))
        continue;
      const groups = blank ? [] : value.split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean);
      checkManagedMemberships(next, person, groups);
      setMembershipValue(person, groups);
    }
    next.contactsMemberships = next.teachers.map((person) => [person.id, display(person),
      person.profile?.Role || "", (membershipValue(person) || []).join("\n")]);
  }
  if (scope === "Exclusions") {
    unique(r.Exclusions, (x) => x["Staff ID"], "staff");
    next.levelExclusions = r.Exclusions.map((x) => ({
      teacher: staff(x),
      levels: ["1", "2", "3", "4", "5", "6"].filter((l) => bool(x["P" + l])),
    }));
  }
  if (scope === "Offload") {
    unique(r.Offload, (x) => x["Rule ID"], "rule");
    next.offload = {
      ...doc.offload,
      schema: 2,
      roleOverrideSchema: 1,
      tags: r.Offload.map((x) => {
        id(x["Rule ID"]);
        check(
          [
            "Appointment group",
            "Employment Modifier",
            "Staff tag",
            "Role",
            "Membership",
            "Subject Modifier",
          ].includes(x.Source),
          "Invalid offload match source.",
        );
        const standard = nullable(x["Standard Percent"]),
          acting = nullable(x["Acting Percent"]);
        check(
          (standard === null || standard <= 100) &&
            (acting === null || acting <= 100),
          "Offload percent exceeds 100.",
        );
        return {
          id: x["Rule ID"],
          name: text(x["Rule Name"]),
          source: x.Source,
          match: text(x.Match),
          percent: standard ?? "",
          actingPercent: acting ?? "",
          periods: nullable(x["Period Cap"]) ?? "",
          notes: text(x.Notes || "", 4000, true),
        };
      }),
    };
  }
  if (scope === "Span of Control") {
    const base = exportWorkbook(doc, scope, schoolId, revision),
      eligibleIds = new Set(base.sheets.Hierarchy.rows.map((r) => r[0])),
      allowedIds = new Set(reportingStaff(doc).map(t => t.id)),
      reportingPeople = new Map(reportingStaff(doc, { retainHistorical: true }).map(t => [t.id, t])),
      oldParents = Object.fromEntries(
        base.sheets.Hierarchy.rows.map((r) => [r[0], r[2]]),
      );
    const h = {};
    unique(r.Hierarchy, (x) => x["Staff ID"], "hierarchy staff");
    check(
      r.Hierarchy.length === eligibleIds.size,
      "Hierarchy must preserve every staff member.",
    );
    for (const row of r.Hierarchy) {
      const s = id(row["Staff ID"]);
      check(eligibleIds.has(s), "Unknown or ineligible reporting Staff ID.");
      const baseRow = base.sheets.Hierarchy.rows.find((r) => r[0] === s);
      for (let i = 1; i < SCHEMAS[scope].Hierarchy.length; i++)
        if (i !== 2)
          check(
            row[SCHEMAS[scope].Hierarchy[i]] === baseRow[i],
            "Only Parent RO Staff ID is editable.",
          );
      const p = row["Parent RO Staff ID"] || "";
      check(!p || eligibleIds.has(p), "Unknown or ineligible parent RO.");
      h[s] = p;
    }
    const ro = wb.sheets["RO Columns"],
      fromColumns = {},
      seen = new Set(),
      columnIds = new Set();
    check(ro.columns.includes("Unassigned"), "Keep the Unassigned column.");
    for (let ci = 0; ci < ro.columns.length; ci++) {
      const header = ro.columns[ci],
        match = /\[([^\[\]]+)\]$/.exec(header);
      const parent = header === "Unassigned" ? "" : match?.[1];
      check(
        parent !== undefined &&
          (!parent || eligibleIds.has(parent)) &&
          !columnIds.has(parent),
        "RO header must contain unique permanent Staff ID.",
      );
      columnIds.add(parent);
      if (parent) {
        const label = header.slice(0, header.lastIndexOf("[")).trim();
        check(
          label === display(reportingPeople.get(parent)) ||
            matches[label] === parent,
          "RO header name and Staff ID conflict.",
          "STAFF_NAME_CONFLICT",
          409,
        );
      }
      for (const row of ro.rows) {
        const value = row[ci];
        if (!value) continue;
        const m = /\[([^\[\]]+)\]$/.exec(value);
        check(
          m && eligibleIds.has(m[1]) && !seen.has(m[1]),
          "Duplicate or unknown RO-column staff.",
        );
        const label = value.slice(0, value.lastIndexOf("[")).trim();
        check(
          label === display(reportingPeople.get(m[1])) || matches[label] === m[1],
          "RO cell name and Staff ID conflict.",
          "STAFF_NAME_CONFLICT",
          409,
        );
        seen.add(m[1]);
        fromColumns[m[1]] = parent;
      }
    }
    check(
      seen.size === eligibleIds.size,
      "RO Columns must preserve every staff member.",
    );
    const parents = reportingLinks(doc), originalLinks = { ...parents },
      changedIds = new Set(), clearedOrphans = new Set();
    for (const s of eligibleIds) {
      const a = h[s],
        b = fromColumns[s],
        old = oldParents[s] || "";
      check(
        a === b || a === old || b === old,
        "Conflicting parents in the two sheets.",
        "REPORTING_CONFLICT",
        409,
      );
      parents[s] = a === old ? b : a;
      if (parents[s] !== old) changedIds.add(s);
      check(parents[s] !== s, "Self-parent is invalid.");
      if (reportingRoot(doc, reportingPeople.get(s)))
        check(parents[s] === old || parents[s] === "", "School Leader root is protected.");
      if (parents[s] && parents[s] !== old) {
        check(
          allowedIds.has(s) && allowedIds.has(parents[s]),
          "New reporting relationships require currently eligible staff.",
        );
      }
      if (!teacherMap.has(s) && !parents[s]) {
        // An incoming historical reference may project a missing parent row.
        // A blank projected row is not a new durable identity or graph edge.
        if (changedIds.has(s)) clearedOrphans.add(s);
        if (changedIds.has(s) || !Object.hasOwn(originalLinks, s)) delete parents[s];
      }
    }
    for (const s of Object.keys(parents)) {
      const visited = new Set();
      let p = s;
      while (p) {
        check(!visited.has(p), "Reporting cycle.");
        visited.add(p);
        p = parents[p];
      }
    }
    const retainedStaff = new Map((doc.reporting?.staff || []).map(t => [t.id, t]));
    for (const t of reportingPeople.values()) {
      const prior = retainedStaff.get(t.id);
      if (!teacherMap.has(t.id)) {
        if (prior && changedIds.has(t.id) && Object.hasOwn(prior, "ro"))
          retainedStaff.set(t.id, { ...prior, ro: "" });
        continue;
      }
      retainedStaff.set(t.id, {
        ...prior, id: t.id, name: t.name || t.id,
        active: t.active, role: t.profile?.Role || "", groups: t.groups,
        ...(!prior || changedIds.has(t.id) ? { ro: parents[t.id] || "" } : {}),
      });
    }
    const officers = { ...doc.reporting?.officers };
    for (const s of changedIds) {
      if (clearedOrphans.has(s)) delete officers[s];
      else officers[s] = parents[s];
    }
    const previousColumns = new Set(doc.reporting?.roColumnIds || []);
    next.reporting = {
      ...doc.reporting,
      parents,
      officers,
      roColumnIds: [...columnIds].filter(s => s && (teacherMap.has(s) || previousColumns.has(s))),
      staff: [...retainedStaff.values()],
    };
  }
  return { scope, document: applyCatalogueLinks(applyRoleMemberships(next)), proposals };
}
