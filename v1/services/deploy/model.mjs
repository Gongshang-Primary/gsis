import { normalizeRoleMemberships, applyRoleMemberships, checkManagedMemberships, roleMapping } from "./role-memberships.mjs";
import { applyCatalogueLinks, choiceLists, normalizeHRChoices, EDITABLE_HR_CHOICE_FIELDS } from "./catalogue-links.mjs";
import Workload from "../../../shared/workload.js";
import Relief from "../../../shared/relief.js";
import Rules from "../../../shared/teaching-rules.js";
import Fields from "./planning-fields.mjs";
import TGScope from "../../../shared/tg-scope.js";
import PAL from "../../../shared/pal.js";
import VenueGroups from "../../../shared/venue-groups.js";
import AscExport from "../../../shared/asc-export.js";
import { STANDARD_SUBJECTS, parseLoad, storedLoad, knownLoadSubject, readLoad, isReferenceSubject,
  validSubject, planningView, parseSplit, storedSplit } from "../../web/shared/deploy-loads.mjs";
import {
  check,
  id,
  text,
  finite,
  plain,
  unique,
  isRecord,
} from "./validation.mjs";
import { ApiError } from "../../runtime/errors.mjs";
import { normalizeDirectValue } from "../../contacts/direct-fields.mjs";
import { planningSnapshot, planningEligible, reportingEligible, reportingRoot, reportingStaff, reportingLinks, hasReportingEdge, projectPlanningNames } from "../../web/shared/deploy-eligibility.mjs";
import { departmentChangeConflicts } from "../../web/shared/deploy-departments.mjs";
function validated(fn, ...args) {
  try {
    return fn(...args);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("DEPLOY_INVALID", 400, e.message);
  }
}
export const defaults = () => ({
  schemaVersion: 1,
  classes: [],
  groups: [],
  assignments: [],
  teachers: [],
  venues: [],
  layout: [],
  loads: Object.fromEntries(
    ["1", "2", "3", "4", "5", "6"].map((l) => [
      l,
      {
        ...Object.fromEntries(STANDARD_SUBJECTS.map(subject => [subject, null])),
        Assembly: 0,
        FTGP: 0,
        FTT: 0,
        EL: 0,
        Math: 0,
        Science: null,
        PHE: 0,
        Art: 0,
        Music: 0,
        PAL: 0,
      },
    ]),
  ),
  organisations: { dept: [], comm: [], plt: [], events: [], cca: [] },
  duties: [],
  teacherDrafts: {},
  teacherNotes: {},
  levelExclusions: [],
  offload: Rules.migrate(null),
  relief: {
    ...Relief.defaults(),
    siuePercent: 190,
    siuePercentBySpecialism: { PE: 90, Art: 90, Music: 90 },
  },
  classNameSets: [
    {
      id: "new",
      name: "New set",
      pairs: [
        ["Perseverance", "P"],
        ["Thrift", "T"],
        ["Integrity", "I"],
        ["Respect", "R"],
        ["Courage", "C"],
        ["Harmony", "H"],
        ["Graciousness", "G"],
        ["Kindness", "K"],
      ],
    },
    {
      id: "two-letter",
      name: "Values (two-letter)",
      pairs: [
        ["Graciousness", "Gc"],
        ["Gratitude", "Gt"],
        ["Prudence", "P"],
        ["Resilience", "Rs"],
        ["Respect", "Rp"],
        ["Integrity", "I"],
        ["Diligence", "D"],
        ["Empathy", "E"],
        ["Kindness", "K"],
      ],
    },
  ],
  fortnight: {},
  workload: { categories: {} },
  membership: [],
  hrTerms: {},
  reporting: null,
  ascExport: {},
});
export const classKey = (c) =>
  String(c.level) +
  (String(c.shortName).startsWith(String(c.level))
    ? String(c.shortName).slice(String(c.level).length)
    : c.shortName);
export const can = (principal, permission) =>
  principal.capabilities?.includes(permission) === true;
export function authority(principal, permission) {
  check(
    principal && !principal.impersonating && can(principal, permission),
    "You cannot change this planning scope.",
    "CAPABILITY_DENIED",
    403,
  );
}
export function catalogueDisplay(catalogues) {
  // Historical definitions are descriptive only; never recreate role-level permissions.
  const hrTerms = {};
  for (const catalogue of catalogues)
    for (const entry of catalogue.entries || []) {
      if (entry.active)
        (hrTerms[entry.category || "Role"] ??= []).push(entry.code);
    }
  return { hrTerms, membership: [] };
}
const deploymentTagFields = {
  "Employment Modifier": "employmentTags",
  "Subject Modifier": "subjectTags",
  "MK Modifier": "mkTags",
  Role: "role",
  "EO Appt Level": "eoAppointmentLevel",
  "Appointment Status": "appointmentStatus",
  Memberships: "memberships",
  "Employment Arrangement": "employmentArrangement",
  "Employment Status": "employmentStatus",
  "School Section": "schoolSection",
  "Personnel Category": "personnelCategory",
};
// Absence is unknown; null is an explicit Contacts clear; [] is a known empty list.
export function membershipValue(teacher) {
  if (!Object.hasOwn(teacher.deploymentTags || {}, "Memberships")) return undefined;
  return validated(normalizeDirectValue, "memberships", teacher.deploymentTags.Memberships);
}
export function setMembershipValue(teacher, value) {
  const normalized = validated(normalizeDirectValue, "memberships", value);
  teacher.deploymentTags = { ...teacher.deploymentTags, Memberships: normalized };
  teacher.groups = normalized === null ? [] : [...normalized];
}
export function mergeContacts(doc, projection, {
  refreshMemberships = false,
  includeUnlisted = true,
  addStaffIds = [],
} = {}) {
  check(
    projection &&
      Array.isArray(projection.staff) &&
      typeof projection.revision === "string" &&
      Number.isSafeInteger(projection.asOf),
    "Contacts facts cannot be verified.",
    "CONTACTS_UNAVAILABLE",
    503,
  );
  const code = (v) =>
    typeof v === "string" ? v : typeof v?.code === "string" ? v.code : "";
  const previous = new Map(doc.teachers.map((teacher) => [teacher.id, teacher]));
  const people = projection.staff.map((p) => {
    const fields = p.fields || null,
      hasFact = (name) => {
        const f = fields?.[name];
        return (
          f?.state === "accepted" &&
          f.effective === true &&
          f.revoked !== true &&
          (f.validFrom == null || f.validFrom <= projection.asOf) &&
          (f.validUntil == null || f.validUntil > projection.asOf)
        );
      },
      hasClear = (name) => {
        const f = fields?.[name];
        return f?.state === "superseded" && f.cleared === true && f.value === null &&
          Number.isSafeInteger(f.validFrom) && f.validFrom <= projection.asOf &&
          (f.validUntil === null || (Number.isSafeInteger(f.validUntil) && f.validUntil > projection.asOf));
      },
      accepted = (name) => (hasFact(name) ? fields[name].value : null),
      active = fields ? accepted("employmentActive") : p.active,
      section = fields
        ? accepted("schoolSection")
        : p.schoolSection || p.profile?.section,
      sectionName = code(section).toLowerCase();
    const tokens = (value) =>
      Array.isArray(value) ? value.map(code).filter(Boolean) : [];
    // Retain typed version inputs separately from the legacy display/calculation
    // profile. Missing evidence is absent; a current explicit clear is null/[].
    const deploymentTags = fields ? Object.fromEntries(
      Object.entries(deploymentTagFields).filter(([, field]) => hasFact(field) || hasClear(field))
        .map(([label, field]) => {
          const value = accepted(field);
          return [label, value === null ? null : Array.isArray(value) ? tokens(value) : code(value)];
        }),
    ) : null;
    const native = fields
      ? {
          "Basic Name": p.basicName || p.name,
          "TTb Name": p.ttbName || p.name,
          Role: deploymentTags.Role || "",
          "EO Appt Level": deploymentTags["EO Appt Level"] || "",
          "Appointment Status": deploymentTags["Appointment Status"] || "",
          "Employment Modifier": [
            deploymentTags["Employment Arrangement"],
            ...(deploymentTags["Employment Modifier"] || []),
          ]
            .filter(Boolean)
            .join(";"),
          "Subject Modifier": (deploymentTags["Subject Modifier"] || []).join(";"),
          "MK Modifier": (deploymentTags["MK Modifier"] || []).join(";"),
          Active: active === true ? "Y" : active === false ? "N" : "",
        }
      : p.profile || {};
    const authority = fields
      ? Object.fromEntries(
          ["eo", "smc", "schoolLeader"].map((name) => [
            name,
            hasFact(name)
              ? {
                  value: fields[name].value,
                  revision: fields[name].revision,
                  validFrom: fields[name].validFrom,
                  validUntil: fields[name].validUntil,
                }
              : { value: null, state: "missing" },
          ]),
        )
      : p.authority || {};
    const required = [
      "employmentActive",
      "schoolSection",
      "employmentArrangement",
      "role",
      "eoAppointmentLevel",
      "appointmentStatus",
      "employmentTags",
      "subjectTags",
      "eo",
    ];
    const quality = fields
      ? required.every((name) => hasFact(name))
        ? "verified"
        : "unavailable"
      : p.quality || "unavailable";
    const teacher = {
      id: p.staffId || p.id,
      name:
        p.ttbName ||
        native["TTb Name"] ||
        p.name ||
        native["Basic Name"] ||
        p.staffId,
      ttbName: p.ttbName || native["TTb Name"] || p.name,
      active: active === true,
      activeKnown: typeof active === "boolean",
      schoolSection: sectionName || null,
      mk: ["mk", "mke"].includes(sectionName),
      profile: native,
      ...(p.ttbNameInputs ? { ttbNameInputs: p.ttbNameInputs } : {}),
      ...(fields ? { deploymentTags } : {}),
      groups: tokens(fields ? accepted("memberships") : p.groups),
      authority,
      fieldRevisions: p.fieldRevisions || {},
      contactsRevision: String(p.revision || projection.revision),
      quality,
    };
    // Keep the version's actual ordinary planning choices separate from fresh
    // accepted authority/capacity facts. A bootstrap is still only a read;
    // note-only saves do not call mergeContacts or annotate unrelated rows.
    const savedPlanning = previous.get(teacher.id);
    teacher.planningProfile = planningSnapshot(
      !refreshMemberships && savedPlanning ? savedPlanning : teacher,
    );
    const excluded = [
      ...(active === false ? ["INACTIVE"] : []),
      ...(authority.eo?.value === false ? ["NON_EO"] : []),
      ...(teacher.mk ? ["MK_SECTION"] : []),
      ...(!Rules.eligible(teacher) ? ["TEACHING_EXCLUSION"] : []),
    ];
    const missing = [
      ...(typeof active !== "boolean" ? ["ACTIVITY_UNVERIFIED"] : []),
      ...(typeof authority.eo?.value !== "boolean" ? ["EO_UNVERIFIED"] : []),
      ...(sectionName !== "primary" && !teacher.mk
        ? ["SECTION_UNVERIFIED"]
        : []),
    ];
    teacher.teachingEligibility = excluded.length
      ? { state: "excluded", reasons: excluded }
      : missing.length
        ? { state: "unavailable", reasons: missing }
        : { state: "eligible", reasons: [] };
    // Eligibility always uses current Contacts evidence. Only the ordinary
    // planning list, including its unknown state, belongs to this saved version.
    const saved = previous.get(teacher.id);
    if (!refreshMemberships && saved) {
      const value = membershipValue(saved);
      if (value === undefined) {
        if (teacher.deploymentTags) delete teacher.deploymentTags.Memberships;
        teacher.groups = [];
      } else setMembershipValue(teacher, value);
    }
    return teacher;
  });
  const hrTerms = {},
    contactsMemberships = [],
    contactsFacts = [];
  for (const person of people) {
    contactsMemberships.push([
      person.id,
      person.ttbName,
      person.profile.Role || "",
      person.groups.join("\n"),
    ]);
    for (const [field, value] of Object.entries(person.profile)) {
      if (["Basic Name", "TTb Name", "Active"].includes(field) || !value)
        continue;
      const values = [
        "Employment Modifier",
        "Subject Modifier",
        "MK Modifier",
      ].includes(field)
        ? value.split(";")
        : [value];
      hrTerms[field] ??= [];
      for (const item of values)
        if (item) {
          if (!hrTerms[field].includes(item)) hrTerms[field].push(item);
          contactsFacts.push([person.id, person.ttbName, field, item]);
        }
    }
  }
  const map = new Map(people.map((p) => [p.id, p]));
  const oldIds = new Set(doc.teachers.map((t) => t.id));
  const teacherDrafts = refreshMemberships ? Object.fromEntries(
    Object.entries(doc.teacherDrafts || {}).map(([staffId, input]) => {
      const value = { ...input };
      // Duplication refreshes actual ordinary Role/Active for known Contacts
      // identities. Keep draft-only people and every unrelated proposed field.
      if (map.has(staffId)) { delete value.Role; delete value.Active; }
      return [staffId, value];
    }),
  ) : doc.teacherDrafts;
  return projectPlanningNames(applyCatalogueLinks(applyRoleMemberships({
    ...doc,
    teacherDrafts,
    teachers: [
      ...doc.teachers.map((t) =>
        map.has(t.id)
          ? map.get(t.id)
          : {
              ...t,
              orphan: true,
              quality: "unavailable",
              teachingEligibility: {
                state: "unavailable",
                reasons: ["CONTACTS_ID_MISSING"],
              },
            },
      ),
      ...people.filter((p) => !oldIds.has(p.id) &&
        (includeUnlisted || addStaffIds.includes(p.id))),
    ],
    catalogues: projection.catalogues || doc.catalogues || [],
    membership: structuredClone(doc.membership || []),
    contactsMemberships,
    hrTerms,
    contactsFacts,
  })));
}
// This canonicalization is private to comparison/import; reading never rewrites history.
export function canonicalTeachingDocument(document, original = document) {
  const next = structuredClone(document);
  const legacyScope = (g) =>
    JSON.stringify({
      form: g.form ?? null,
      sources: g.sources ?? null,
      anchorRef: g.anchorRef ?? null,
      levelWide: g.levelWide === true,
      levels: VenueGroups.levels(g),
    });
  for (const group of next.groups) {
    if (Array.isArray(group.classRefs)) continue;
    const prior = original.groups.find((g) => g.id === group.id),
      useOriginal = prior && legacyScope(prior) === legacyScope(group),
      source = useOriginal ? original : document,
      sourceGroup = useOriginal ? prior : group,
      scope = VenueGroups.scope(source, sourceGroup);
    if (
      scope.unresolved.length ||
      (!scope.classRefs.length && !scope.levelWide)
    )
      continue;
    group.classRefs = scope.classRefs;
    group.levelWide = scope.levelWide;
    const anchor = VenueGroups.anchor(source, sourceGroup);
    if (!scope.levelWide && anchor?.ref) group.anchorRef = anchor.ref;
  }
  for (const assignment of next.assignments) {
    if (next.groups.some((g) => g.id === assignment.target)) continue;
    const matches = next.classes.filter(
      (c) =>
        c.ref === assignment.targetRef ||
        (!assignment.targetRef && classKey(c) === assignment.target),
    );
    if (matches.length === 1) assignment.targetRef = matches[0].ref;
  }
  return next;
}
const fixedGroupSlots = { dept: 2, comm: 4, cca: 4, plt: 1, events: 2 };
/** Normal New keeps the selected definitions and placements, without its staff assignments. */
export function newPlanningVersion(source) {
  const doc = structuredClone(source);
  doc.teachers = [];
  doc.teacherDrafts = {};
  doc.teacherNotes = {};
  doc.removedTeachers = {};
  doc.assignments = [];
  for (const [kind, groups] of Object.entries(doc.organisations || {}))
    for (const group of groups) {
      group.slots = Array(fixedGroupSlots[kind] ?? 0).fill("");
      delete group.additionalDeputies;
      delete group.tls;
      delete group.legacyLeadership;
    }
  for (const duty of doc.duties || []) duty.teachers = {};
  for (const activity of doc.workload?.nonTeachingActivities || [])
    activity.teachers = [];
  doc.reporting = null;
  doc.relief = defaults().relief;
  doc.pal = PAL.defaults();
  doc.audit = [];
  doc.fieldAuthors = {};
  doc.saveReceipts = [];
  delete doc.pendingUnitRename;
  delete doc.conflictNotices;
  delete doc.status;
  return doc;
}
function memberOccurrence(values, index, start = 0) {
  return values.slice(start, index + 1).filter(value => value === values[index]).length;
}
function retainedGroupReference(kind, before, after, field, index) {
  const fixed = field === "slots" ? fixedGroupSlots[kind] || 0 : 0;
  if (index < fixed) return before?.[field]?.[index] === after[field][index];
  return memberOccurrence(after[field], index, fixed) <=
    (before?.[field] || []).slice(fixed).filter(value => value === after[field][index]).length;
}
function legacyOccurrence(rows, index) {
  const row = rows[index];
  return rows.slice(0, index + 1).filter(value => value.role === row.role && value.teacher === row.teacher).length;
}
function groupMemberCounts(group) {
  const counts = new Map();
  const add = (staffId) => {
    if (typeof staffId === "string" && staffId) {
      counts.set(staffId, (counts.get(staffId) || 0) + 1);
    }
  };
  for (const field of ["slots", "additionalDeputies", "tls"]) {
    for (const staffId of group?.[field] || []) add(staffId);
  }
  for (const row of group?.legacyLeadership || []) add(row?.teacher);
  return counts;
}
function tlAppointmentEligible(doc, teacher) {
  if (!planningEligible(doc, teacher)) return false;
  const draft = doc?.teacherDrafts?.[teacher.id];
  const raw =
    draft && Object.hasOwn(draft, "EO Appt Level")
      ? draft["EO Appt Level"]
      : teacher.planningProfile?.["EO Appt Level"] ??
        teacher.profile?.["EO Appt Level"] ??
        teacher.deploymentTags?.["EO Appt Level"] ??
        teacher.authority?.eoAppointmentLevel?.value ??
        teacher.eoAppointmentLevel ??
        "";
  return ["ST", "LT", "MTT"].includes(String(raw ?? "").trim());
}
function dutyIntervalsOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}
function retainedDutyOverlap(oldDuties, a, b, day, staffId) {
  const oldA = (oldDuties || []).find((row) => row.id === a.id);
  const oldB = (oldDuties || []).find((row) => row.id === b.id);
  return !!(
    oldA &&
    oldB &&
    oldA.teachers?.[day] === staffId &&
    oldB.teachers?.[day] === staffId &&
    dutyIntervalsOverlap(oldA, oldB)
  );
}
function planningBindings(document, original = document) {
  const doc = canonicalTeachingDocument(document, original);
  const bindings = new Map(
    doc.assignments.map((a) => {
      const group = doc.groups.find((g) => g.id === a.target),
        cls = doc.classes.find((c) => c.ref === a.targetRef),
        scope = group ? VenueGroups.scope(doc, group) : null,
        levels = group
          ? VenueGroups.levels(group)
          : [String(cls?.level || a.level || "")];
      const target = group
        ? {
            kind: "group",
            id: group.id,
            subject: group.subject,
            levels,
            levelWide: scope.levelWide,
            classRefs: (scope.levelWide
              ? doc.classes
                  .filter((c) => levels.includes(String(c.level)))
                  .map((c) => c.ref)
              : scope.classRefs
            )
              .slice()
              .sort(),
            unresolved: scope.unresolved.slice().sort(),
          }
        : { kind: "class", id: cls?.ref || a.targetRef || a.target, levels };
      return [
        JSON.stringify(["assignment", a.id]),
        {
          staffId: a.teacher,
          signature: JSON.stringify({
            staffId: a.teacher,
            subject: a.subject,
            target,
          }),
        },
      ];
    }),
  );
  for (const [kind, groups] of Object.entries(doc.organisations || {})) for (const group of groups || []) {
    for (const field of ["slots", "additionalDeputies", "tls"])
      for (const [index, staffId] of (group[field] || []).entries()) if (staffId) {
        const fixed = field === "slots" ? fixedGroupSlots[kind] || 0 : 0;
        // Member suffixes compact/reorder; identity and occurrence count are
        // stable, unlike leadership roles which retain their fixed positions.
        const position = index < fixed ? ["role", index]
          : ["member", staffId, memberOccurrence(group[field], index, fixed)];
        const target = ["organisation", kind, group.id, field, position];
        bindings.set(JSON.stringify(target), { staffId, signature: JSON.stringify({ staffId, target }) });
      }
    for (const [index, row] of (group.legacyLeadership || []).entries()) if (row.teacher) {
      const target = ["organisation", kind, group.id, "legacyLeadership", row.role, row.teacher,
        legacyOccurrence(group.legacyLeadership, index)];
      bindings.set(JSON.stringify(target), { staffId: row.teacher, signature: JSON.stringify({ staffId: row.teacher, target }) });
    }
  }
  for (const duty of doc.duties || []) for (const [day, staffId] of Object.entries(duty.teachers || {})) if (staffId) {
    const target = ["duty", duty.id, day];
    bindings.set(JSON.stringify(target), { staffId, signature: JSON.stringify({ staffId, target }) });
  }
  return bindings;
}
export function changedTeachingStaff(before, after, explicitStaffIds = []) {
  // The existing owner admission path also fences new organisational/duty
  // references against current Contacts identity, not just class assignments.
  const old = planningBindings(before),
    changed = new Set(explicitStaffIds);
  for (const [id, binding] of planningBindings(after, before))
    if (old.get(id)?.signature !== binding.signature)
      changed.add(binding.staffId);
  return [...changed].sort();
}
export function validateTeachingBindings(
  before,
  after,
  projection,
  explicitStaffIds = [],
) {
  const changed = changedTeachingStaff(before, after, explicitStaffIds);
  if (!changed.length) return after;
  const normalized = mergeContacts(after, projection, { includeUnlisted: false }),
    people = new Map(normalized.teachers.map((t) => [t.id, t]));
  for (const staffId of changed)
    check(
      planningEligible(after, people.get(staffId)),
      "Choose active staff outside MK, SAT, Support and School Leader groups. Existing planning assignments may be retained or removed.",
      "TEACHING_ELIGIBILITY_REQUIRED",
      409,
    );
  return normalized;
}
export function calculate(doc, contacts) {
  const source = mergeContacts(planningView(doc), contacts, { includeUnlisted: false });
  const accepted = {
    ...source,
    teachers: source.teachers.map((t) => ({ ...t, profile: { ...t.profile } })),
    teacherDrafts: {},
  };
  const rules = (t) => {
    const r = Rules.calculate(t, accepted.offload);
    return {
      ...r,
      eligible: r.eligible && t.teachingEligibility?.state === "eligible",
    };
  };
  const work = Workload.analyse(accepted, rules),
    relief = Relief.analyse(accepted, work);
  // Preserve the saved classification map. Explicit activity records supply their
  // declared non-teaching type; no unknown timetable code is classified by name.
  const subjectCategories = accepted.workload?.categories
    ? structuredClone(accepted.workload.categories)
    : null;
  if (subjectCategories)
    for (const activity of accepted.workload?.nonTeachingActivities || [])
      subjectCategories[activity.code] = "Non-teaching";
  const sharedFactsComplete = source.teachers.every(
    (t) =>
      t.quality === "verified" || t.teachingEligibility?.state === "excluded",
  );
  const rows = relief.rows.map((r) => {
    const fact = source.teachers.find((t) => t.id === r.id),
      w = work.rows.find((x) => x.teacher.id === r.id);
    const reasons = [
      ...(r.reason ? [r.reason] : []),
      ...(!sharedFactsComplete
        ? ["Shared workload inputs depend on incomplete Contacts facts."]
        : []),
      ...(fact?.quality === "verified"
        ? []
        : ["Accepted personal facts are incomplete."]),
    ];
    const quality =
      r.Wi === null ? "unavailable" : reasons.length ? "estimated" : "verified";
    return {
      staffId: r.id,
      rawTimetabledOccupancy: w?.total ?? null,
      Wi: r.Wi,
      actualCapCountedWorkload: r.capWorkload,
      weeklyBudget: r.weeklyBudget,
      factor: r.timetableFactor,
      cap: r.periodCap,
      capConfigured: r.capConfigured,
      capBasis: r.capBasis ?? null,
      capNonTeachingPeriods:
        !w || w.incomplete || w.capIncomplete || r.capNonTeachingPeriods == null
          ? null
          : structuredClone(r.capNonTeachingPeriods),
      capHeadroom: r.capHeadroom,
      teaching: r.actualTeaching,
      offload: r.OF,
      siueCoefficient:
        r.siuePercentApplied == null ? null : r.siuePercentApplied / 100,
      quality,
      reasons,
      fieldRevisions: fact?.fieldRevisions || {},
      contactsRevision: fact?.contactsRevision || contacts.revision,
    };
  });
  return {
    schemaVersion: 1,
    calculationVersion: "deploy-workload/1",
    settings: relief.settings,
    settingsRevision: source.settingsRevision || 1,
    subjectCategories,
    sharedInputs: {
      T_avg: relief.reference.T_avg,
      quality: !relief.reference.available
        ? "unavailable"
        : sharedFactsComplete
          ? "verified"
          : "estimated",
      reasons: [
        ...(relief.reference.reason ? [relief.reference.reason] : []),
        ...(!sharedFactsComplete
          ? ["Shared Contacts inputs are incomplete."]
          : []),
      ],
    },
    rows,
    ui: {
      schema: 3,
      units: "periods/week",
      planningQuota: true,
      targetSettings: Workload.fajtTargetSettings(accepted.relief),
      teachers: relief.rows.map((r) => ({
        teacherId: r.id,
        name: r.name,
        active: r.active,
        eligible: r.eligible,
        R: r.quota,
        available: r.quota !== null,
        reason: r.reason || null,
        OF: r.OF,
        Ti: r.actualTeaching,
        quality: rows.find((x) => x.staffId === r.id)?.quality,
        breakdown: {
          employment: r.employment,
          teachingVerified: r.teachingVerified,
          FTT: r.FTT,
          PD: r.pd,
          duties: r.duties,
          otherNonTeaching: r.otherNonTeaching,
          nonTeachingActivities: r.nonTeachingActivities,
          weeklyBudget: r.weeklyBudget,
          timetableFactor: r.timetableFactor,
          Wi: r.Wi,
          rawR: r.rawQuota,
          normalR: r.normalQuota,
          periodCap: r.periodCap,
          capConfigured: r.capConfigured,
          capBasis: r.capBasis,
          capWorkload: r.capWorkload,
          capHeadroom: r.capHeadroom,
          capApplied: r.capApplied,
          offloadAllowance: r.offloadAllowance,
          siuePeriods: r.siuePeriods,
          siuePercentApplied: r.siuePercentApplied ?? null,
          siueBasis: r.siueBasis ?? null,
          offloadComponents: r.offloadComponents,
          available: r.quota !== null,
          reason: r.reason || null,
        },
      })),
      calculationVersion: relief.calculationVersion,
      reference: relief.reference,
      issues: relief.issues,
    },
    admin: {
      settings: relief.settings,
      weeklyPeriods: relief.weeklyPeriods,
      weeklyLunch: 0,
      calculationVersion: relief.calculationVersion,
      reference: relief.reference,
      rows: relief.rows,
    },
  };
}
export function validateDocument(doc) {
  plain(doc);
  if (doc.hrChoicesSchema !== undefined) {
    check(doc.hrChoicesSchema === 1, "Unsupported HR choice schema.");
    check(isRecord(doc.hrChoices) && Object.keys(doc.hrChoices).length === EDITABLE_HR_CHOICE_FIELDS.length &&
      Object.keys(doc.hrChoices).every((field) => EDITABLE_HR_CHOICE_FIELDS.includes(field)), "Stored HR choice fields are invalid.");
    normalizeHRChoices(choiceLists(doc), doc);
  }
  if (doc.roleMembershipSchema !== undefined) {
    check(doc.roleMembershipSchema === 1, "Unsupported role mapping schema.");
    normalizeRoleMemberships(doc.membership);
  }
  if (doc.year !== undefined)
    check(
      Number.isInteger(doc.year) && doc.year >= 2000 && doc.year <= 2099,
      "Use an explicit planning year from 2000 to 2099.",
    );
  check(
    doc.classes.length <= 160 &&
      doc.groups.length <= 1000 &&
      doc.teachers.length <= 512 &&
      doc.assignments.length <= 5000,
    "Planning bounds exceeded.",
  );
  const staff = unique(doc.teachers, (t) => id(t.id), "staff"),
    classes = unique(doc.classes, (c) => id(c.ref || c.id), "class"),
    codes = unique(doc.classes, classKey, "class name"),
    groups = unique(doc.groups, (g) => id(g.id), "TG"),
    venues = unique(doc.venues, (v) => id(v.id), "venue");
  unique(doc.assignments, (a) => id(a.id), "assignment");
  unique(
    doc.assignments,
    (a) => `${a.target}|${a.subject}|${a.teacher}`,
    "assignment",
  );
  for (const c of doc.classes) {
    check(/^[1-6]$/.test(String(c.level)), "Use a level from 1 to 6.");
    text(c.name);
    text(c.shortName, 40);
    check(
      !c.venueId || venues.has(c.venueId),
      "Class references unknown venue.",
    );
  }
  for (const g of doc.groups) {
    text(g.name);
    text(g.subject, 60);
    check(!g.venue || venues.has(g.venue), "TG references unknown venue.");
    check(
      (g.classRefs || []).every((r) => classes.has(r)),
      "TG references a missing class.",
    );
    check(
      !g.levelWide || !(g.classRefs || []).length,
      "Choose whole-level or explicit classes.",
    );
  }
  for (const a of doc.assignments) {
    check(staff.has(a.teacher), "Assignment references unknown staff.");
    check(
      groups.has(a.target) || codes.has(a.target) || classes.has(a.targetRef),
      "Assignment references missing class/TG.",
    );
    text(a.subject, 60);
  }
  if (doc.reporting) {
    const parents = doc.reporting.parents || doc.reporting.officers || {};
    for (const [s, parent] of Object.entries(parents)) {
      check(
        staff.has(s) && (!parent || staff.has(parent)) && parent !== s,
        "Invalid reporting relationship.",
      );
      let p = parent,
        seen = new Set([s]);
      while (p) {
        check(!seen.has(p), "Reporting cycle.");
        seen.add(p);
        p = parents[p];
      }
    }
  }
  return doc;
}
const proposalFields = [
  "Basic Name",
  "Role",
  "Appointment Status",
  "Employment Modifier",
  "Subject Modifier",
  "Active",
];
export function applyEdits(doc, edits) {
  check(
    Array.isArray(edits) && edits.length > 0 && edits.length <= 500,
    "Use 1 to 500 edits.",
  );
  const d = edits.some((edit) =>
    ["updateClass", "renameClasses"].includes(edit?.operation),
  )
    ? canonicalTeachingDocument(doc)
    : structuredClone(doc);
  for (const e0 of edits) {
    const e = plain(e0),
      op = e.operation;
    check(typeof op === "string", "Missing operation.");
    const teacher = () => {
      const t = d.teachers.find((t) => t.id === e.teacher);
      check(t, "Unknown staff.");
      return t;
    };
    const group = () => {
      const g = d.groups.find((g) => g.id === (e.groupId || e.localId));
      check(g, "Unknown TG.");
      return g;
    };
    const cls = () => {
      const c = d.classes.find(
        (c) =>
          c.ref === (e.ref || e.formRef) ||
          classKey(c) === (e.previous || e.form),
      );
      check(c, "Unknown class.");
      return c;
    };
    const expect = (value) => {
      if (Object.hasOwn(e, "expected"))
        check(
          JSON.stringify(value) === JSON.stringify(e.expected) ||
            JSON.stringify(value) === JSON.stringify(e.value),
          "This value changed; review your retained draft.",
          "REVISION_CONFLICT",
          409,
        );
    };
    if (
      ["setMembership", "setHRTerms", "setMasterOptions"].includes(op) ||
      (op === "patchPlanning" &&
        ["setMembership", "setMasterOptions"].includes(e.source))
    )
      check(
        false,
        "Contacts catalogue is reference-only.",
        "REFERENCE_ONLY",
        403,
      );
    if (op === "metadata") {
      if (e.year !== undefined) d.year = Number(e.year);
      d.name = text(e.name, 120);
      d.from = e.from || "";
      d.to = e.to || "";
      if (e.notes !== undefined) d.notes = text(e.notes, 4000, true);
      continue;
    }
    if (op === "setTeacherNote") {
      teacher();
      d.teacherNotes ??= {};
      expect(d.teacherNotes[e.teacher] || "");
      d.teacherNotes[e.teacher] = text(e.value, 4000, true);
      continue;
    }
    if (op === "setRoleMemberships") {
      check(Object.hasOwn(e, "expected") && Array.isArray(e.expected), "Supply the previous role matrix.");
      check(JSON.stringify(normalizeRoleMemberships(d.membership || [])) === JSON.stringify(normalizeRoleMemberships(e.expected)),
        "Role mappings changed; review your retained draft.", "REVISION_CONFLICT", 409);
      d.membership = normalizeRoleMemberships(e.value);
      d.roleMembershipSchema = 1;
      applyCatalogueLinks(applyRoleMemberships(d));
      continue;
    }
    if (op === "setHRChoices") {
      check(Object.hasOwn(e, "expected"), "Supply the previous HR choices.");
      const expected = normalizeHRChoices(e.expected, d, { derivedRole: true });
      check(JSON.stringify(choiceLists(d)) === JSON.stringify(expected),
        "HR choices changed; review your retained draft.", "REVISION_CONFLICT", 409);
      const value = normalizeHRChoices(e.value, d, { derivedRole: true });
      d.hrChoicesSchema = 1;
      d.hrChoices = Object.fromEntries(EDITABLE_HR_CHOICE_FIELDS.map((field) => [field, value[field]]));
      applyCatalogueLinks(d);
      continue;
    }
    if (op === "setTeacherMemberships") {
      id(e.teacher, "Staff ID");
      const t = teacher();
      check(Array.isArray(e.value), "Supply an explicit Memberships list.");
      check(Object.hasOwn(e, "expected") && (e.expected === null || Array.isArray(e.expected)),
        "Supply the previous Memberships value.");
      const expected = e.expected === null ? null : validated(normalizeDirectValue, "memberships", e.expected);
      check(JSON.stringify(membershipValue(t) ?? null) === JSON.stringify(expected),
        "Memberships changed; review your retained draft.", "REVISION_CONFLICT", 409);
      checkManagedMemberships(d, t, e.value);
      setMembershipValue(t, e.value);
      d.contactsMemberships = d.teachers.map((person) => [person.id, person.ttbName || person.name,
        person.profile?.Role || "", (membershipValue(person) || []).join("\n")]);
      continue;
    }
    if (op === "setTeacherField" || op === "upsertTeacherProfile") {
      const t = teacher();
      d.teacherDrafts ??= {};
      const supplied =
        op === "setTeacherField"
          ? { [e.field]: e.value }
          : e.value || e.profile;
      check(isRecord(supplied), "Invalid profile.");
      const projectedRole = { ...d, teacherDrafts: { ...d.teacherDrafts,
        [t.id]: { ...d.teacherDrafts[t.id], ...Object.fromEntries(Object.entries(supplied).filter(([key]) => proposalFields.includes(key))) } } };
      const mapping = roleMapping(projectedRole, t);
      for (const [k, v] of Object.entries(supplied))
        if (!proposalFields.includes(k))
          check(
            v === (k === "EO Appt Level" && mapping ? mapping[12] : (t.profile?.[k] ?? "")),
            "Reference fields cannot be changed by Deploy.",
          );
      const values = Object.fromEntries(
        Object.entries(supplied).filter(([k]) => proposalFields.includes(k)),
      );
      check(
        Object.keys(values).length > 0,
        "Only approved Contacts contribution fields can be proposed.",
      );
      d.teacherDrafts[t.id] ??= {};
      for (const [k, v] of Object.entries(values)) {
        check(
          k === "Active"
            ? typeof v === "boolean" || ["Y", "N"].includes(v)
            : typeof v === "string" && v.length <= 160,
          "Invalid proposed field.",
        );
        d.teacherDrafts[t.id][k] = v;
      }
      continue;
    }
    if (op === "setLoad") {
      const l = String(e.level);
      check(!isReferenceSubject(e.subject), "FORM is calculated from Assembly, FTGP and FTT; PD is supplied by PLT membership.", "REFERENCE_ONLY", 400);
      check(
        isRecord(d.loads) && Object.hasOwn(d.loads, l) && isRecord(d.loads[l]) && knownLoadSubject(d, e.subject),
        "Unknown subject load.",
      );
      check(Object.hasOwn(e, "value"), "Supply an explicit subject load; omitted fields do not clear data.");
      const value = validated(parseLoad, e.value), current = readLoad(d, l, e.subject);
      if (Object.hasOwn(e, "expected")) check(
        JSON.stringify(current) === JSON.stringify(storedLoad(e.expected)) || JSON.stringify(current) === JSON.stringify(value),
        "This value changed; review your retained draft.", "REVISION_CONFLICT", 409);
      d.loads[l][e.subject] = value;
      continue;
    }
    if (op === "addSubject") {
      const sub = text(e.subject, 60);
      check(validSubject(sub) && !isReferenceSubject(sub), "Choose a subject code distinct from calculated FORM and reference PD.");
      for (const loads of Object.values(d.loads)) {
        check(!Object.hasOwn(loads, sub), "Subject already exists.");
        loads[sub] = null;
      }
      continue;
    }
    if (op === "addLevel") {
      const l = String(e.level);
      check(/^[1-6]$/.test(l) && !d.loads[l], "Invalid existing level.");
      d.loads[l] = Object.fromEntries(
        Object.keys(d.loads["1"] || {}).map((s) => [s, null]),
      );
      continue;
    }
    if (op === "addClass") {
      const ref = e.ref || crypto.randomUUID();
      check(!d.classes.some((c) => c.ref === ref), "Class already exists.");
      d.classes.push({
        ref: id(ref),
        level: String(e.level),
        name: text(e.name),
        shortName: text(e.shortName, 40),
        ability: e.ability || "",
      });
      continue;
    }
    if (op === "updateClass") {
      const c = cls();
      check(
        String(e.level) === String(c.level),
        "Change of class level requires explicit reference reconciliation.",
      );
      const old = classKey(c);
      Object.assign(c, {
        name: text(e.name),
        shortName: text(e.shortName, 40),
      });
      for (const a of d.assignments)
        if (a.targetRef === c.ref || a.target === old) {
          a.target = classKey(c);
          a.targetRef = c.ref;
        }
      continue;
    }
    if (op === "renameClasses") {
      check(Array.isArray(e.rows), "Missing classes.");
      for (const row of e.rows) {
        const c = d.classes.find((c) => c.ref === row.ref);
        check(
          c && String(c.level) === String(row.level),
          "Invalid class rename.",
        );
        const old = classKey(c);
        c.name = text(row.name);
        c.shortName = text(row.shortName, 40);
        for (const a of d.assignments)
          if (a.target === old || a.targetRef === c.ref) {
            a.target = classKey(c);
            a.targetRef = c.ref;
          }
      }
      continue;
    }
    if (op === "setClassAbility") {
      cls().ability = text(e.value || "", 80, true);
      continue;
    }
    if (op === "deleteClass") {
      const c = cls();
      check(
        !d.assignments.some(
          (a) => a.targetRef === c.ref || a.target === classKey(c),
        ) &&
          !d.groups.some(
            (g) => g.classRefs?.includes(c.ref) || g.anchorRef === c.ref,
          ),
        "Remove dependent assignments and TGs first.",
        "DEPENDENCY_CONFLICT",
        409,
      );
      d.classes = d.classes.filter((x) => x !== c);
      continue;
    }
    if (op === "addTeacher" || op === "removeTeacher") {
      const prior =
        op === "removeTeacher" && e.assignmentId
          ? d.assignments.find((a) => a.id === e.assignmentId)
          : null;
      const target = e.target || prior?.target,
        sub = text(e.subject || prior?.subject, 60);
      if (!e.teacher && prior) e.teacher = prior.teacher;
      const t = teacher();
      // Owning saves verify current identity and version planning eligibility.
      // Retained references/removals never depend on a cached capacity flag.
      if (op === "removeTeacher") {
        d.assignments = d.assignments.filter((a) =>
          e.assignmentId
            ? a.id !== e.assignmentId
            : !(a.target === target && a.subject === sub && a.teacher === t.id),
        );
      } else {
        check(
          !d.assignments.some(
            (a) =>
              a.target === target && a.subject === sub && a.teacher === t.id,
          ),
          "Assignment exists.",
        );
        if (sub === "FT")
          check(
            !d.assignments.some(
              (a) => a.subject === "FT" && a.teacher === t.id,
            ),
            "This teacher already has a form class.",
            "ASSIGNMENT_CONFLICT",
            409,
          );
        const c = d.classes.find(
            (c) => classKey(c) === target || c.ref === e.targetRef,
          ),
          g = d.groups.find((g) => g.id === target);
        check(c || g, "Unknown class/TG.");
        check(
          sub === "FT" ||
            (g ? g.subject === sub : Workload.isFormSubject(d, c.level, sub)),
          "This subject is not offered for the selected class/TG.",
        );
        d.assignments.push({
          id: crypto.randomUUID(),
          target: g?.id || classKey(c),
          ...(c ? { targetRef: c.ref } : {}),
          subject: sub,
          teacher: t.id,
          level: String(g?.level || c.level),
        });
      }
      continue;
    }
    if (op === "addTG") {
      const gid = e.localId || crypto.randomUUID();
      d.groups.push({
        id: id(gid),
        name: text(e.name),
        subject: text(e.subject, 60),
        level: String(e.level),
        levels: e.levels || [String(e.level)],
        classRefs: e.classRefs || [],
        anchorRef: e.anchorRef || "",
        levelWide: !!e.levelWide,
        weeklyPeriods: e.weeklyPeriods ?? null,
        venue: e.venue || "",
      });
      continue;
    }
    if (op === "updateTG") {
      expect(VenueGroups.state(d, e));
      validated(VenueGroups.update, d, e);
      continue;
    }
    if (op === "removeTG") {
      const g = group();
      d.groups = d.groups.filter((x) => x !== g);
      d.assignments = d.assignments.filter((a) => a.target !== g.id);
      continue;
    }
    if (op === "moveTG") {
      group().venue = e.venue || "";
      continue;
    }
    if (op === "moveClass") {
      expect(VenueGroups.room(d, e.form)?.id || "");
      validated(VenueGroups.move, d, e);
      const c = cls();
      c.venueId = e.venue || "";
      continue;
    }
    if (op === "clearVenueAssignments") {
      expect(VenueGroups.clearState(d));
      validated(VenueGroups.clearVenues, d);
      for (const c of d.classes) c.venueId = "";
      continue;
    }
    if (op === "moveVenueGroup" || op === "moveClassBlock") {
      expect(VenueGroups.state(d, e));
      validated(VenueGroups.move, d, e);
      for (const c of d.classes)
        c.venueId = VenueGroups.room(d, classKey(c))?.id || "";
      continue;
    }
    if (op === "setLevelExclusions" || op === "setExclusionCell") {
      teacher();
      d.levelExclusions ??= [];
      let x = d.levelExclusions.find((x) => x.teacher === e.teacher);
      if (!x) {
        x = { teacher: e.teacher, levels: [] };
        d.levelExclusions.push(x);
      }
      if (op === "setLevelExclusions") {
        check(
          e.levels.every((l) => /^[1-6]$/.test(String(l))),
          "Invalid levels.",
        );
        x.levels = [...new Set(e.levels.map(String))];
      } else {
        check(
          /^[1-6]$/.test(String(e.level)) && typeof e.checked === "boolean",
          "Invalid exclusion.",
        );
        x.levels = x.levels.filter((l) => l !== String(e.level));
        if (e.checked) x.levels.push(String(e.level));
      }
      continue;
    }
    if (op === "setOffload") {
      check(
        isRecord(e.value) &&
          Array.isArray(e.value.tags) &&
          Object.keys(e.value.staff || {}).length === 0,
        "Individual SIUE/offload overrides are unsupported.",
      );
      expect(d.offload);
      d.offload = Rules.migrate(e.value);
      for (const r of d.offload.tags)
        for (const k of ["percent", "actingPercent"])
          if (r[k] !== "" && r[k] !== null) finite(r[k], 0, 100);
      continue;
    }
    if (op === "setReliefSettings") {
      expect(d.relief);
      d.relief = validated(Relief.validate, d, e.value);
      continue;
    }
    if (op === "setWorkload") {
      expect(d.workload);
      d.workload = validated(Workload.validate, d, e.value);
      continue;
    }
    if (op === "setSubjectType") {
      d.subjectTypes ??= {};
      d.subjectTypes[e.subject] = validated(
        Workload.validateSubjectType,
        planningView(d),
        e.subject,
        e.value,
      );
      continue;
    }
    if (op === "setFortnight") {
      d.fortnight ??= {};
      check(typeof e.row === "string" && e.row.length <= 200, "Invalid split field.");
      const row = validated(JSON.parse, e.row);
      check(Array.isArray(row) && row.length === 2 && ["string", "number"].includes(typeof row[0]) && typeof row[1] === "string", "Invalid split field.");
      const [level, subject] = row;
      check(
        isRecord(d.loads) && Object.hasOwn(d.loads, level) && isRecord(d.loads[level]) && knownLoadSubject(d, subject) &&
          ["wt", "wd", "ws", "ft", "fd", "fs", "remarks", "enabled"].includes(
            e.field,
          ),
        "Invalid split field.",
      );
      check(Object.hasOwn(e, "value"), "Supply an explicit split value; omitted fields do not clear data.");
      const value = validated(parseSplit, e.value, e.field);
      if (Object.hasOwn(e, "expected")) {
        const current = storedSplit(d.fortnight[e.row]?.[e.field] ?? (e.field === "enabled" ? false : ""), e.field);
        check(JSON.stringify(current) === JSON.stringify(storedSplit(e.expected, e.field)) || JSON.stringify(current) === JSON.stringify(value),
          "This value changed; review your retained draft.", "REVISION_CONFLICT", 409);
      }
      d.fortnight[e.row] ??= {};
      d.fortnight[e.row][e.field] = value;
      continue;
    }
    if (
      op === "setOrganisation" ||
      op === "setDuties" ||
      op === "setAscExportSettings" ||
      op === "patchPlanning"
    ) {
      const source = op === "patchPlanning" ? e.source : op;
      const old =
        source === "setOrganisation"
          ? d.organisations?.[e.kind] || []
          : source === "setDuties"
            ? d.duties
            : source === "setAscExportSettings"
              ? d.ascExport || {}
              : null;
      check(old !== null, "Unsupported planning table.");
      if (op === "patchPlanning") {
        check(Array.isArray(e.changes) && e.changes.length <= 5000 && e.changes.every(c =>
          isRecord(c) && typeof c.key === "string" &&
          (c.old === null || typeof c.old === "string") &&
          (c.value === null || typeof c.value === "string")), "Invalid planning changes.");
        const flat = validated(Fields.flat, old);
        for (const c of e.changes)
          check(
            (flat[c.key] ?? null) === c.old ||
              (flat[c.key] ?? null) === c.value,
            "Planning field changed.",
            "REVISION_CONFLICT",
            409,
          );
      } else expect(old);
      // Encoded fields cross the same shape/depth/key boundary as direct edits.
      const value = op === "patchPlanning" ? plain(validated(Fields.apply, old, e.changes)) : e.value;
      if (source === "setOrganisation") {
        check(
          ["dept", "comm", "plt", "events", "cca"].includes(e.kind) &&
            Array.isArray(value) &&
            value.length <= 100,
          "Invalid organisation.",
        );
        unique(value, (g) => {
          check(isRecord(g), "Invalid group.");
          return id(g.id);
        }, "group");
        for (const g of value) {
          text(g.name);
          const previousGroup = old.find(row => row.id === g.id);
          for (const field of ["slots", "additionalDeputies", "tls"]) {
            if (field !== "slots" && !Object.hasOwn(g, field)) continue;
            check(
              (field === "slots" || e.kind === "dept") &&
              Array.isArray(g[field]) && g[field].length <= 300 &&
              g[field].every(s => typeof s === "string" && (!s || d.teachers.some(t => t.id === s))),
              "Unknown group member.",
            );
            for (const [index, staffId] of g[field].entries()) {
              if (!staffId) continue;
              const retained = retainedGroupReference(e.kind, previousGroup, g, field, index);
              const teacher = d.teachers.find(t => t.id === staffId);
              check(retained || planningEligible(d, teacher),
                "Choose an active eligible teacher for a new group assignment.", "TEACHING_ELIGIBILITY_REQUIRED", 409);
              if (e.kind === "dept" && field === "tls") {
                check(retained || tlAppointmentEligible(d, teacher),
                  "Department TLs must be active eligible ST, LT or MTT teachers.", "TL_ELIGIBILITY_REQUIRED", 409);
              }
            }
          }
          if (Object.hasOwn(g, "legacyLeadership")) {
            check(e.kind === "comm" && Array.isArray(g.legacyLeadership) && g.legacyLeadership.length <= 2 &&
              g.legacyLeadership.every(row => isRecord(row) && ["Head", "Deputy"].includes(row.role) &&
                typeof row.teacher === "string" && d.teachers.some(t => t.id === row.teacher)), "Invalid retained committee leadership.");
            for (const [index, row] of g.legacyLeadership.entries()) check(
              legacyOccurrence(g.legacyLeadership, index) <= (previousGroup?.legacyLeadership || [])
                .filter(before => before.role === row.role && before.teacher === row.teacher).length ||
                planningEligible(d, d.teachers.find(t => t.id === row.teacher)),
              "Choose an active eligible teacher for a new group assignment.", "TEACHING_ELIGIBILITY_REQUIRED", 409);
          }
          const priorCounts = groupMemberCounts(previousGroup);
          for (const [staffId, count] of groupMemberCounts(g).entries()) {
            const priorCount = priorCounts.get(staffId) || 0;
            check(
              count <= 1 || (priorCount >= 2 && count <= priorCount),
              "A teacher may appear only once within a group.",
              "DUPLICATE_GROUP_MEMBER",
              409,
            );
          }
        }
        if (e.kind === "dept") check(departmentChangeConflicts(old, value).length === 0,
          "A teacher cannot be added to another department. Move the teacher or review retained memberships.",
          "DEPARTMENT_MEMBERSHIP_CONFLICT", 409);
        d.organisations[e.kind] = value;
      }
      if (source === "setDuties") {
        check(Array.isArray(value) && value.length <= 200, "Invalid duties.");
        unique(value, (x) => id(x.id), "duty");
        const assignedByDayStaff = new Map();
        for (const x of value) {
          check(
            /^\d\d:\d\d$/.test(x.start) &&
              /^\d\d:\d\d$/.test(x.end) &&
              x.start < x.end,
            "Invalid duty interval.",
          );
          check(
            x.days.every((n) => Number.isInteger(n) && n >= 0 && n <= 4) &&
              Object.values(x.teachers).every(
                (s) => !s || d.teachers.some((t) => t.id === s),
              ),
            "Invalid duty assignment.",
          );
          const previousDuty = old.find(row => row.id === x.id);
          for (const [day, staffId] of Object.entries(x.teachers)) if (staffId) {
            check(previousDuty?.teachers?.[day] === staffId || planningEligible(d, d.teachers.find(t => t.id === staffId)),
              "Choose an active eligible teacher for a new duty assignment.", "TEACHING_ELIGIBILITY_REQUIRED", 409);
            const bucketKey = `${day}|${staffId}`;
            const priorList = assignedByDayStaff.get(bucketKey) || [];
            for (const other of priorList) {
              if (dutyIntervalsOverlap(x, other)) {
                check(
                  retainedDutyOverlap(old, x, other, day, staffId),
                  "Duty intervals overlap for the same teacher on the same weekday.",
                  "DUTY_OVERLAP_CONFLICT",
                  409,
                );
              }
            }
            priorList.push(x);
            assignedByDayStaff.set(bucketKey, priorList);
          }
        }
        d.duties = value;
      }
      if (source === "setAscExportSettings")
        d.ascExport = validated(AscExport.validateSettings, value);
      continue;
    }
    if (op === "initReporting") {
      check(!d.reporting, "Reporting already initialized.");
      d.reporting = {
        staff: reportingStaff(d).map((t) => ({
          id: t.id,
          name: t.name,
          active: t.active,
          role: t.profile?.Role || "",
          groups: t.groups,
        })),
        officers: {},
        parents: {},
      };
      continue;
    }
    if (op === "setReportingOfficer") {
      id(e.officer, "Staff ID");
      const person = d.teachers.find((t) => t.id === e.officer);
      const links = reportingLinks(d), old = links[e.officer] || "";
      expect(old);
      if (!person) {
        // Removing an existing orphan edge does not authorise a new identity.
        // Require the observed link, then remove only this person's aliases;
        // an empty staff.ro is no edge and cannot resurrect the orphan key.
        check(d.reporting && hasReportingEdge(d, e.officer) &&
          Object.hasOwn(e, "expected") && e.value === "", "Choose a known version Staff ID.");
        d.reporting.parents = { ...d.reporting.parents };
        d.reporting.officers = { ...d.reporting.officers };
        delete d.reporting.parents[e.officer];
        delete d.reporting.officers[e.officer];
        if (Array.isArray(d.reporting.staff)) d.reporting.staff = d.reporting.staff.map(row =>
          row.id === e.officer && Object.hasOwn(row, "ro") ? { ...row, ro: "" } : row);
        continue;
      }
      check(reportingEligible(d, person) || (Object.hasOwn(links, e.officer) &&
        (e.value === old || e.value === "")),
        "Choose an active eligible officer, or clear an existing retained link.");
      check(
        !reportingRoot(d, person) || e.value === old || e.value === "",
        "School Leader root is protected.",
      );
      check(
        typeof e.value === "string" &&
          (e.value === old || !e.value || reportingEligible(d, d.teachers.find((t) => t.id === e.value))),
        "Choose an active eligible reporting officer.",
      );
      check(e.value === old || !e.value || reportingEligible(d, person),
        "An excluded officer's retained link may only be kept or cleared.");
      d.reporting ??= { staff: reportingStaff(d).map(t => ({ id: t.id, name: t.name,
        active: t.active, role: t.profile?.Role || "", groups: t.groups })), officers: {}, parents: {} };
      d.reporting.parents = {
        ...links,
        [e.officer]: e.value,
      };
      // Preserve contradictory legacy aliases for review. Only this explicitly
      // edited person's aliases are reconciled; another officer's data stays.
      d.reporting.officers = { ...(d.reporting.officers || links), [e.officer]: e.value };
      if (Array.isArray(d.reporting.staff)) d.reporting.staff = d.reporting.staff.map(row =>
        row.id === e.officer && Object.hasOwn(row, "ro") ? { ...row, ro: e.value } : row);
      continue;
    }
    if (op === "upsertClassNameSet") {
      const set = e.set;
      id(set.id);
      text(set.name);
      check(
        Array.isArray(set.pairs) &&
          set.pairs.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              p.every((x) => typeof x === "string"),
          ),
        "Invalid class name set.",
      );
      d.classNameSets = d.classNameSets
        .filter((s) => s.id !== set.id)
        .concat(set);
      continue;
    }
    if (op === "deleteClassNameSet") {
      check(d.classNameSets.length > 1, "Keep one class name set.");
      d.classNameSets = d.classNameSets.filter((s) => s.id !== e.setId);
      continue;
    }
    if (op === "setPAL") {
      check(isRecord(e.value), "Invalid PAL policy.");
      validated(PAL.set, d, e.value);
      continue;
    }
    if (op === "consolidateCCEEL") {
      validated(TGScope.consolidate, d);
      continue;
    }
    if (op === "convertLegacySubject" || op === "retireLegacySubject") {
      check(
        /^Pull\/(?:F?Sci|FSC)$/i.test(e.subject),
        "Choose the retired legacy subject.",
      );
      const uses = [...d.groups, ...d.assignments].filter(
        (x) => x.subject === e.subject,
      );
      if (op === "retireLegacySubject")
        check(
          !uses.length,
          "Reconcile existing references first.",
          "DEPENDENCY_CONFLICT",
          409,
        );
      else {
        check(
          ["Science", "FSC"].includes(e.targetSubject),
          "Choose Science or FSC.",
        );
        check(
          uses.every((x) => d.loads[x.level]?.[e.targetSubject] != null),
          "Configure target loads before conversion.",
        );
        for (const x of uses) x.subject = e.targetSubject;
      }
      for (const loads of Object.values(d.loads)) delete loads[e.subject];
      continue;
    }
    if (op === "removeTeacherProfile") {
      const removed = teacher();
      check(
        !d.assignments.some((a) => a.teacher === e.teacher),
        "Remove assignments before removing a planning reference.",
        "DEPENDENCY_CONFLICT",
        409,
      );
      d.teachers = d.teachers.filter((t) => t.id !== e.teacher);
      d.removedTeachers ??= {};
      d.removedTeachers[e.teacher] = removed;
      delete d.teacherDrafts[e.teacher];
      delete d.teacherNotes[e.teacher];
      continue;
    }
    check(
      false,
      `Unsupported planning operation: ${op}.`,
      "UNKNOWN_OPERATION",
      400,
    );
  }
  return validateDocument(applyCatalogueLinks(applyRoleMemberships(d)));
}
