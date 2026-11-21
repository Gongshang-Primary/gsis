import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { productSuite } from "./v1-product/suite.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";
import { canonical } from "../v1/runtime/store.mjs";
import { planningPerson, planningEligible, reportingEligible, reportingLinks, reportingConflicts } from "../v1/web/shared/deploy-eligibility.mjs";

// The policy is exercised through real built Workers, Core decisions and local
// D1. Historical fixtures below are local-only records, not hosted data edits.
const startedAt = performance.now();
const suite = await productSuite(), school = "synthetic-school", clientId = "synthetic-planning-client";
const browserFields = vm.createContext({});
vm.runInContext(await readFile(new URL("../shared/fields.js", import.meta.url), "utf8"), browserFields);
const organisationPatch = (kind, before, after) => ({ operation: "patchPlanning", source: "setOrganisation", kind,
  changes: JSON.parse(JSON.stringify(browserFields.GSISFields.diff(before, after))) });
let serial = 0;
const operation = label => "synthetic-planning-eligibility-" + label + "-" + ++serial;
const cases = [
  ["ordinary", "Teacher", "Y", "Primary", true, true],
  ["mk", "MKE", "Y", "MK", false, false],
  ["sat", "SAT", "Y", "Primary", true, false],
  ["satmk", "SAT", "Y", "MK", true, false],
  ["support", "Support Staff", "Y", "Primary", true, false],
  ["sl", "SL", "Y", "Primary", true, false],
  ["oso", "OSO", "Y", "Primary", true, false],
  ["inactive", "Teacher", "N", "Primary", false, false],
  ["unknown", "Teacher", undefined, "Primary", false, false],
  ["missing-eo", "Teacher", "Y", "Primary", true, true],
];
try {
  const admin = await suite.seedAccount("synthetic-planning-admin");
  const additions = cases.map(([key, role, active, section]) => ({ id: "synthetic-planning-row-" + key, values: {
    "Basic Name": "Synthetic Planning " + key, "Statutory Name": "Synthetic Planning " + key,
    Role: role, "School Section": section, ...(active === undefined ? {} : { Active: active }),
  } }));
  const created = await suite.call(admin, "contacts", "/save-data", { operationId: operation("contacts"), changes: [], additions });
  const ids = Object.fromEntries(cases.map(([key]) => [key, created.mapping["synthetic-planning-row-" + key]]));
  for (const field of ["eo", "smc", "schoolLeader"])
    await suite.call(admin, "contacts", "/staff/" + ids.ordinary + "/accept", {
      operationId: operation("accepted-authority"), field, value: field === "eo", revision: 0,
      ownerReviewReference: "Synthetic planning authority fixture",
    });
  const reader = await suite.seedAccount("synthetic-planning-reader", { capabilities: [], staffId: ids.ordinary });
  const { versionId } = await suite.call(admin, "deploy", "/versions/create", {
    operationId: operation("create"), name: "Synthetic planning eligibility", year: 2026,
  });
  const db = await suite.db("deploy"), contacts = await suite.db("contacts"), core = await suite.db("core");
  const rows = async (database, sql, ...args) => (await database.prepare(sql).bind(...args).all()).results;
  const stored = async () => (await loadVersion(db, school, versionId)).doc;
  const raw = async scopes => (await rows(db, "SELECT scope,row_id,revision,value FROM deploy_rows WHERE school_id=? AND version_id=? ORDER BY scope,row_id", school, versionId))
    .filter(row => !scopes || scopes.includes(row.scope));
  const fixtureRow = async (scope, id, value) => db.prepare("INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,?,?,1,?) ON CONFLICT(school_id,version_id,scope,row_id) DO UPDATE SET value=excluded.value")
    .bind(school, versionId, scope, id, canonical(value)).run();
  const lease = async (user = admin, client = clientId) => {
    const grant = await suite.call(user, "deploy", "/lease", { operationId: operation("lease"), versionId, scope: "meta", clientId: client });
    return { versionId, scope: "meta", clientId: client, leaseFence: grant.fence };
  };
  const save = async (edits, extra = {}) => {
    const input = { ...(await lease()), operationId: operation("save"), edits, ...extra };
    return { input, result: await suite.call(admin, "deploy", "/change", input) };
  };
  const denied = async (input, status, user = admin) => {
    const before = await raw(), document = await stored();
    const result = await suite.request(user, "deploy", "/change", { method: "POST", body: input });
    assert.equal(result.status, status, JSON.stringify(result.body));
    assert.deepEqual(await raw(), before, "Rejected intent cannot partially rewrite planning rows");
    assert.deepEqual(await stored(), document, "Rejected intent cannot advance the version");
    return result;
  };
  const reject = async (edits, status = 400) => denied({ ...(await lease()), operationId: operation("rejected"), edits }, status);
  const span = () => suite.call(admin, "deploy", "/export", { versionId, scope: "Span of Control" });
  const authority = async () => ({
    fields: await rows(contacts, "SELECT * FROM contacts_fields WHERE school_id=? ORDER BY staff_id,field", school),
    staff: await rows(contacts, "SELECT * FROM contacts_staff WHERE school_id=? ORDER BY staff_id", school),
    grants: await rows(core, "SELECT * FROM core_grants WHERE school_id=? ORDER BY account_id,capability", school),
  });
  const acceptedBefore = await authority();
  const readerCapabilities = async () => {
    const response = await suite.request(reader, "core", "/session");
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return [...response.body.data.capabilities].sort();
  };
  const coreCapabilitiesBefore = await readerCapabilities();
  await db.prepare("INSERT INTO deploy_publications(school_id,id,sequence,version_id,working_revision,operation_id,payload_digest,payload_key,envelope,published_at,decision_id) VALUES(?,?,1,?,0,?,?,?,?,?,?)")
    .bind(school, "synthetic-planning-prior-publication", versionId, "synthetic-planning-prior-operation", "synthetic-prior-digest",
      "synthetic-prior-payload", canonical({ immutable: "synthetic-planning-prior-capture", versionId }), Date.now(), "synthetic-prior-decision").run();
  const publicationBefore = await rows(db, "SELECT * FROM deploy_publications WHERE school_id=? ORDER BY id", school);
  const initial = await stored();
  for (const [key, , , , report, plan] of cases) {
    const person = initial.teachers.find(t => t.id === ids[key]);
    assert(person, "Version inventory retains " + key);
    assert.equal(reportingEligible(initial, person), report, "Span choice: " + key);
    assert.equal(planningEligible(initial, person), plan, "General planning choice: " + key);
  }
  const beforeRead = await raw();
  const boot = await suite.call(admin, "deploy", "/bootstrap", { versionId });
  const exported = await span();
  assert.deepEqual(exported.sheets.Hierarchy.rows.map(row => row[0]).sort(), cases.filter(row => row[4]).map(row => ids[row[0]]).sort());
  assert.equal(boot.current.reporting, null, "An uninitialized graph is only a read projection");
  assert.equal((await stored()).reporting, null);
  assert.deepEqual(await raw(), beforeRead, "Opening/read-exporting Span does not initialize or save a graph");

  await reject([{ operation: "setReportingOfficer", officer: ids.ordinary, value: ids.sl, expected: "" },
    { operation: "setReportingOfficer", officer: ids.support, value: ids.support, expected: "" }]);
  assert.equal((await stored()).reporting, null, "A rejected first-edit batch cannot partially initialize reporting");

  const first = await save([{ operation: "setReportingOfficer", officer: ids.ordinary, value: ids.sl, expected: "" }]);
  assert.equal(reportingLinks(await stored())[ids.ordinary], ids.sl);
  assert((await stored()).reporting.staff.some(t => t.id === ids.satmk), "First explicit edit initializes the available SAT × MK staff too");
  assert.deepEqual(await suite.call(admin, "deploy", "/change", first.input), first.result);
  await denied({ ...first.input, edits: [{ operation: "setReportingOfficer", officer: ids.ordinary, value: ids.support, expected: "" }] }, 409);
  await save([{ operation: "setReportingOfficer", officer: ids.sat, value: ids.ordinary, expected: "" }]);
  await reject([{ operation: "setReportingOfficer", officer: ids.ordinary, value: ids.sat, expected: ids.sl }]);
  await reject([{ operation: "setReportingOfficer", officer: ids.support, value: ids.support, expected: "" }]);
  await reject([{ operation: "setReportingOfficer", officer: ids.sl, value: ids.ordinary, expected: "" }]);
  await reject([{ operation: "setReportingOfficer", officer: ids.ordinary, value: ids.support, expected: ids.sat }], 409);
  await reject([{ operation: "setReportingOfficer", officer: ids.mk, value: ids.sl, expected: "" }]);

  // A note-only save must not annotate or normalize unrelated historical staff.
  const legacyPerson = { ...(await stored()).teachers.find(t => t.id === ids["missing-eo"]) };
  delete legacyPerson.planningProfile;
  await fixtureRow("teachers", legacyPerson.id, legacyPerson);
  const beforeNote = await raw(["teachers"]);
  await save([{ operation: "setTeacherNote", teacher: ids.ordinary, value: "Synthetic retained planning note", expected: "" }]);
  assert.deepEqual(await raw(["teachers"]), beforeNote);

  const kinds = ["dept", "comm", "cca", "plt", "events"];
  for (const kind of kinds) {
    const row = { id: "synthetic-eligibility-" + kind, name: "Synthetic " + kind, slots: [ids.ordinary, ids["missing-eo"]] };
    await save([{ operation: "setOrganisation", kind, value: [row], expected: (await stored()).organisations[kind] }]);
    assert.deepEqual((await stored()).organisations[kind][0].slots, row.slots, "Missing EO is not a general list denial");
    for (const [key, , , , , allowed] of cases) if (!allowed)
      await reject([{ operation: "setOrganisation", kind,
        value: [{ ...row, slots: [ids[key]] }], expected: (await stored()).organisations[kind] }], 409);
  }
  for (const field of ["additionalDeputies", "tls"])
    await reject([{ operation: "setOrganisation", kind: "dept", value: [{ id: "synthetic-dept-negative-" + field,
      name: "Synthetic negative department", slots: [ids.ordinary], [field]: [ids.mk] }], expected: (await stored()).organisations.dept }], 409);
  await reject([{ operation: "setOrganisation", kind: "comm", value: [{ id: "synthetic-negative-leadership", name: "Synthetic negative leadership",
    slots: [ids.ordinary], leadershipSchema: 1, legacyLeadership: [{ role: "Head", teacher: ids.sl }] }], expected: (await stored()).organisations.comm }], 409);

  const duty = { id: "synthetic-eligibility-duty", name: "Synthetic duty", category: "Before School", start: "07:00", end: "07:30",
    days: [0], teachers: { 0: ids["missing-eo"] }, description: "Synthetic duty" };
  await save([{ operation: "setDuties", value: [duty], expected: (await stored()).duties }]);
  for (const [key, , , , , allowed] of cases) if (!allowed)
    await reject([{ operation: "setDuties", value: [{ ...duty, teachers: { 0: ids[key] } }], expected: (await stored()).duties }], 409);
  // Existing excluded assignments remain visible and removable, but not reusable.
  const retainedDept = [{ id: "synthetic-retained-excluded-dept", name: "Synthetic retained department", slots: [ids.mk], additionalDeputies: [ids.sl], tls: [ids.sat] }];
  await fixtureRow("organisations", "dept", retainedDept);
  await save([{ operation: "setOrganisation", kind: "dept", value: [{ ...retainedDept[0], name: "Synthetic renamed retained department" }], expected: (await stored()).organisations.dept }]);
  await save([{ operation: "setOrganisation", kind: "dept", value: [], expected: (await stored()).organisations.dept }]);
  await reject([{ operation: "setOrganisation", kind: "dept", value: retainedDept, expected: [] }], 409);
  // The actual browser encodes these changes by field identity. Removing an
  // earlier member compacts its suffix, but cannot promote or clone an excluded
  // historical member into a new role or a second occurrence.
  for (const [kind, prefix] of Object.entries({ dept: 2, comm: 4, cca: 4, plt: 1, events: 2 })) {
    const retained = [{ id: "synthetic-compaction-" + kind, name: "Synthetic compacted " + kind,
      slots: [...Array(prefix).fill(""), ids.ordinary, ids.mk] }];
    await fixtureRow("organisations", kind, retained);
    let before = (await stored()).organisations[kind];
    const compacted = [{ ...before[0], slots: [...Array(prefix).fill(""), ids.mk] }];
    await save([organisationPatch(kind, before, compacted)]);
    assert.equal((await stored()).organisations[kind][0].slots[prefix], ids.mk);
    before = (await stored()).organisations[kind];
    await reject([organisationPatch(kind, before, [{ ...before[0], slots: [...before[0].slots, ids.mk] }])], 409);
    const promoted = [...Array(prefix).fill("")]; promoted[0] = ids.mk;
    await reject([organisationPatch(kind, before, [{ ...before[0], slots: promoted }])], 409);
  }
  const legacyLead = { id: "synthetic-retained-leadership", name: "Synthetic retained leadership", leadershipSchema: 1,
    slots: ["", "", "", ""], legacyLeadership: [{ role: "Head", teacher: ids.mk }] };
  await fixtureRow("organisations", "comm", [legacyLead]);
  let priorLeads = (await stored()).organisations.comm;
  await save([organisationPatch("comm", priorLeads, [{ ...priorLeads[0], name: "Synthetic renamed leadership" }])]);
  priorLeads = (await stored()).organisations.comm;
  // The classic browser codec rejects duplicate teacher identities itself.
  // Native direct JSON still must enforce occurrence counts on the server.
  await reject([{ operation: "setOrganisation", kind: "comm", expected: priorLeads,
    value: [{ ...priorLeads[0], legacyLeadership: [...priorLeads[0].legacyLeadership, { role: "Head", teacher: ids.mk }] }] }], 409);
  await fixtureRow("organisations", "comm", [{ ...legacyLead, legacyLeadership: [...legacyLead.legacyLeadership, ...legacyLead.legacyLeadership] }]);
  priorLeads = (await stored()).organisations.comm;
  await save([{ operation: "setOrganisation", kind: "comm", expected: priorLeads,
    value: [{ ...priorLeads[0], name: "Synthetic two historical occurrences" }] }]);
  priorLeads = (await stored()).organisations.comm;
  await save([{ operation: "setOrganisation", kind: "comm", expected: priorLeads,
    value: [{ ...priorLeads[0], legacyLeadership: priorLeads[0].legacyLeadership.slice(0, 1) }] }]);
  priorLeads = (await stored()).organisations.comm;
  await reject([{ operation: "setOrganisation", kind: "comm", expected: priorLeads,
    value: [{ ...priorLeads[0], legacyLeadership: [...priorLeads[0].legacyLeadership, { role: "Head", teacher: ids.mk }] }] }], 409);
  await fixtureRow("duties", duty.id, { ...duty, teachers: { 0: ids.mk } });
  await save([{ operation: "setDuties", value: [{ ...duty, name: "Synthetic retained excluded duty", teachers: { 0: ids.mk } }], expected: (await stored()).duties }]);
  await save([{ operation: "setDuties", value: [{ ...duty, teachers: { 0: "" } }], expected: (await stored()).duties }]);

  const classRef = "synthetic-eligibility-class";
  await save([{ operation: "addClass", ref: classRef, level: "1", name: "Synthetic Class", shortName: "A" }]);
  await save([{ operation: "addTeacher", teacher: ids["missing-eo"], target: "1A", targetRef: classRef, subject: "EL" }]);
  assert((await stored()).assignments.some(a => a.teacher === ids["missing-eo"] && a.subject === "EL"));
  for (const [key, , , , , allowed] of cases) if (!allowed)
    await reject([{ operation: "addTeacher", teacher: ids[key], target: "1A", targetRef: classRef, subject: "Math" }], 409);
  await save([{ operation: "setTeacherField", teacher: ids.unknown, field: "Active", value: "Y" }]);
  await save([{ operation: "addTeacher", teacher: ids.unknown, target: "1A", targetRef: classRef, subject: "Math" }]);
  assert.equal((await stored()).teachers.find(t => t.id === ids.unknown).activeKnown, false, "Accepted unknown activity remains unknown");
  assert.equal(planningPerson(await stored(), (await stored()).teachers.find(t => t.id === ids.unknown)).active, true, "The explicit version Active edit controls planning");

  const matrixRow = Array(14).fill("");
  matrixRow[0] = "Teacher"; matrixRow[1] = "Synthetic teacher mapping"; matrixRow[13] = null;
  const mixedRow = [...matrixRow]; mixedRow[9] = "1"; mixedRow[11] = "1";
  const priorBindings = (await stored()).assignments.map(a => a.id).sort();
  await save([{ operation: "setRoleMemberships", value: [mixedRow], expected: (await stored()).membership }]);
  let current = await stored(), ordinary = current.teachers.find(t => t.id === ids.ordinary);
  assert.equal(reportingEligible(current, ordinary), true, "A version SAT × MK mapping is included in Span");
  assert.equal(planningEligible(current, ordinary), false, "The same mapping is excluded from general planning");
  await reject([{ operation: "addTeacher", teacher: ids.ordinary, target: "1A", targetRef: classRef, subject: "Art" }], 409);
  assert.deepEqual((await stored()).assignments.map(a => a.id).sort(), priorBindings, "Existing bindings survive a version tag change");
  const leaderRow = [...matrixRow]; leaderRow[2] = "1";
  await save([{ operation: "setRoleMemberships", value: [leaderRow], expected: (await stored()).membership }]);
  await reject([{ operation: "setReportingOfficer", officer: ids.ordinary, value: ids.support, expected: ids.sl }]);
  const planningRow = [...matrixRow]; planningRow[4] = "1";
  await save([{ operation: "setRoleMemberships", value: [planningRow], expected: (await stored()).membership }]);
  current = await stored(); ordinary = current.teachers.find(t => t.id === ids.ordinary);
  assert.equal(planningEligible(current, ordinary), true);
  assert.deepEqual(await authority(), acceptedBefore, "Draft role/Membership flags do not grant accepted SMC/SL/EO authority");
  assert.deepEqual(await readerCapabilities(), coreCapabilitiesBefore, "Draft SMC flags do not grant the corresponding Core capabilities");

  // Legacy graph aliases are merged without treating an empty alias as a clear.
  const graphStaff = (await stored()).teachers.map(t => ({ id: t.id, name: t.name, role: t.profile?.Role || "", active: true }));
  const aliases = { staff: graphStaff.map(t => ({ ...t, ...(t.id === ids.sat ? { ro: ids.ordinary } : {}) })),
    parents: {}, officers: { [ids.ordinary]: ids.sl } };
  await fixtureRow("_settings", "reporting", aliases);
  await save([{ operation: "setReportingOfficer", officer: ids.support, value: ids.sl, expected: "" }]);
  assert.equal(reportingLinks(await stored())[ids.ordinary], ids.sl);
  assert.equal(reportingLinks(await stored())[ids.sat], ids.ordinary);
  await fixtureRow("_settings", "reporting", { staff: graphStaff.map(t => ({ ...t, ...(t.id === ids.sat ? { ro: ids.ordinary } : {}) })), parents: {}, officers: {} });
  await save([{ operation: "setReportingOfficer", officer: ids.oso, value: ids.sl, expected: "" }]);
  assert.equal(reportingLinks(await stored())[ids.sat], ids.ordinary, "Staff.ro-only relationships survive another person's edit");
  const contradictory = { staff: graphStaff, parents: { [ids.ordinary]: ids.sl, [ids.sat]: ids.ordinary, [ids.mk]: ids.sl },
    officers: { [ids.ordinary]: ids.support, [ids.sat]: ids.ordinary, [ids.mk]: ids.sl } };
  await fixtureRow("_settings", "reporting", contradictory);
  await save([{ operation: "setReportingOfficer", officer: ids.oso, value: ids.sl, expected: "" }]);
  assert.equal((await stored()).reporting.parents[ids.ordinary], ids.sl);
  assert.equal((await stored()).reporting.officers[ids.ordinary], ids.support, "Unrelated contradictory aliases remain for review");
  await save([{ operation: "setReportingOfficer", officer: ids.mk, value: ids.sl, expected: ids.sl }]);
  const historicalSpan = await span();
  assert(historicalSpan.sheets.Hierarchy.rows.some(row => row[0] === ids.mk), "Retained excluded staff stay in the canonical reporting projection");
  await save([{ operation: "setReportingOfficer", officer: ids.mk, value: "", expected: ids.sl }]);
  await reject([{ operation: "setReportingOfficer", officer: ids.mk, value: ids.support, expected: "" }]);
  await save([{ operation: "setReportingOfficer", officer: ids.ordinary, value: "", expected: ids.sl }]);
  assert.equal((await stored()).reporting.parents[ids.ordinary], "");
  assert.equal((await stored()).reporting.officers[ids.ordinary], "", "Only the explicitly edited alias is reconciled");

  const unrelatedGraph = {
    staff: graphStaff.map(t => ({ ...t, ...(t.id === ids.ordinary ? { ro: ids.support } : t.id === ids.sat ? { ro: ids.support } : {}) })),
    parents: { [ids.ordinary]: ids.sl, [ids.sat]: ids.ordinary },
    officers: { [ids.ordinary]: ids.sl, [ids.sat]: ids.sl },
  };
  await fixtureRow("_settings", "reporting", unrelatedGraph);
  await save([{ operation: "setReportingOfficer", officer: ids.ordinary, value: "", expected: ids.sl }]);
  let graph = (await stored()).reporting;
  assert.equal(graph.staff.find(t => t.id === ids.ordinary).ro, "");
  assert.equal(graph.staff.find(t => t.id === ids.sat).ro, ids.support);
  assert.equal(graph.parents[ids.sat], ids.ordinary);
  assert.equal(graph.officers[ids.sat], ids.sl);
  assert(reportingConflicts(await stored()).some(row => row.id === ids.sat), "An unrelated staff.ro conflict remains visible");
  const orphan = "synthetic-orphan-reporting-staff";
  const orphanGraph = { ...graph, parents: { ...graph.parents, [orphan]: ids.sl }, officers: { ...graph.officers, [orphan]: ids.support },
    staff: [...graph.staff, { id: orphan, name: "Synthetic historical orphan", active: false, ro: ids.sl }] };
  await fixtureRow("_settings", "reporting", orphanGraph);
  await reject([{ operation: "setReportingOfficer", officer: orphan, value: "" }]);
  await reject([{ operation: "setReportingOfficer", officer: orphan, value: "", expected: ids.support }], 409);
  await reject([{ operation: "setReportingOfficer", officer: orphan, value: ids.ordinary, expected: ids.sl }]);
  await save([{ operation: "setReportingOfficer", officer: orphan, value: "", expected: ids.sl }]);
  graph = (await stored()).reporting;
  assert(!Object.hasOwn(graph.parents, orphan) && !Object.hasOwn(graph.officers, orphan));
  assert.equal(graph.staff.find(t => t.id === orphan).ro, "");
  assert.equal(graph.staff.find(t => t.id === orphan).name, "Synthetic historical orphan");
  assert(!(await stored()).teachers.some(t => t.id === orphan), "Clearing history does not create an authorised staff identity");
  assert.equal(graph.staff.find(t => t.id === ids.sat).ro, ids.support);
  await reject([{ operation: "setReportingOfficer", officer: orphan, value: "", expected: "" }]);
  await reject([{ operation: "setReportingOfficer", officer: "synthetic-new-unknown-officer", value: "", expected: "" }]);
  await fixtureRow("_settings", "reporting", { ...graph,
    parents: { ...graph.parents, [orphan]: "" }, officers: { ...graph.officers, [orphan]: ids.sl },
    staff: graph.staff.map(row => row.id === orphan ? { ...row, ro: ids.support } : row),
  });
  await save([{ operation: "setReportingOfficer", officer: orphan, value: "", expected: "" }]);
  graph = (await stored()).reporting;
  assert(!Object.hasOwn(graph.parents, orphan) && !Object.hasOwn(graph.officers, orphan));
  assert.equal(graph.staff.find(row => row.id === orphan).ro, "");
  assert.equal(graph.officers[ids.sat], ids.sl, "Masked orphan cleanup preserves another officer's conflicting alias");
  // Reconcile that known person's explicitly selected relationship before the
  // canonical workbook checks; no import guesses how to resolve the conflict.
  await save([{ operation: "setReportingOfficer", officer: ids.sat, value: ids.ordinary, expected: ids.ordinary }]);
  assert(!reportingConflicts(await stored()).some(row => row.id === ids.sat));

  const assignmentIds = document => document.assignments.map(a => a.id).sort();
  for (const scope of ["Span of Control", "IP"]) {
    const prior = await stored(), priorIds = assignmentIds(prior);
    const workbook = await suite.call(admin, "deploy", "/export", { versionId, scope });
    const prepared = await suite.call(admin, "deploy", "/imports/preview", {
      operationId: operation("workbook-preview"), versionId, workbook,
    });
    assert.deepEqual(await stored(), prior, "Canonical " + scope + " preview has no planning-write side effect");
    const input = { ...(await lease()), operationId: operation("workbook-apply"), previewId: prepared.previewId, digest: prepared.digest };
    const applied = await suite.call(admin, "deploy", "/imports/apply", input);
    assert.deepEqual(await suite.call(admin, "deploy", "/imports/apply", input), applied);
    assert.deepEqual(assignmentIds(await stored()), priorIds, "Canonical " + scope + " round-trip retains stable assignment IDs");
    if (scope === "Span of Control") {
      const before = reportingLinks(prior), after = reportingLinks(await stored());
      for (const id of new Set([...Object.keys(before), ...Object.keys(after)]))
        assert.equal(after[id] || "", before[id] || "", "Span workbook preserves each actual reporting relationship");
    }
  }

  // A source-only provisional identity is not a known Contacts refresh target.
  const draftOnlyId = "synthetic-planning-draft-only-person";
  await fixtureRow("teachers", draftOnlyId, { id: draftOnlyId, name: "Synthetic draft-only teacher", ttbName: "Synthetic draft-only teacher",
    active: true, activeKnown: true, profile: { "Basic Name": "Synthetic draft-only teacher", Role: "Teacher", Active: "Y" },
    planningProfile: { Role: "Teacher", Active: "Y" }, groups: [] });
  const draftOnlyInput = { Role: "Support Staff", Active: "N", "Subject Modifier": "Synthetic draft-only specialty" };
  await fixtureRow("teacherDrafts", draftOnlyId, draftOnlyInput);

  const sourceBeforeDuplicate = await stored();
  await save([{ operation: "setTeacherField", teacher: ids.ordinary, field: "Role", value: "Support Staff" },
    { operation: "setTeacherField", teacher: ids.ordinary, field: "Active", value: "N" },
    { operation: "setTeacherField", teacher: ids.ordinary, field: "Subject Modifier", value: "Synthetic Specialty" }]);
  assert.equal(planningEligible(await stored(), (await stored()).teachers.find(t => t.id === ids.ordinary)), false);
  await reject([{ operation: "addTeacher", teacher: ids.ordinary, target: "1A", targetRef: classRef, subject: "Art" }], 409);
  const sourceSaved = await stored();
  const copied = await suite.call(admin, "deploy", "/versions/create", { operationId: operation("duplicate"),
    name: "Synthetic refreshed planning duplicate", sourceVersionId: versionId, duplicate: true });
  const duplicate = (await loadVersion(db, school, copied.versionId)).doc;
  assert.deepEqual(await stored(), sourceSaved, "Duplication never rewrites its source");
  assert.equal(duplicate.teacherDrafts[ids.ordinary]?.Role, undefined);
  assert.equal(duplicate.teacherDrafts[ids.ordinary]?.Active, undefined);
  assert.equal(duplicate.teacherDrafts[ids.ordinary]?.["Subject Modifier"], undefined);
  const duplicatePerson = planningPerson(duplicate, duplicate.teachers.find(t => t.id === ids.ordinary));
  assert.equal(duplicatePerson.active, true);
  assert.equal(duplicatePerson.role, "Teacher");
  assert.notEqual(duplicatePerson.profile["Subject Modifier"], "Synthetic Specialty",
    "Duplicate refreshes Contacts-backed subject modifiers and leaves the source override intact");
  assert.deepEqual(duplicate.teacherDrafts[draftOnlyId], draftOnlyInput);
  assert(duplicate.teachers.some(t => t.id === draftOnlyId), "The source-only stable identity is retained");
  assert.equal(duplicate.teacherDrafts[ids.unknown]?.Active, undefined);
  assert.equal(planningPerson(duplicate, duplicate.teachers.find(t => t.id === ids.unknown)).activeKnown, false,
    "A current Contacts unknown Active is not fabricated as true during refresh");
  assert.deepEqual(duplicate.assignments.map(a => a.id).sort(), sourceBeforeDuplicate.assignments.map(a => a.id).sort());

  await denied({ ...(await lease()), operationId: operation("stale-version"), revision: (await stored()).revision - 1,
    edits: [{ operation: "setTeacherNote", teacher: ids.ordinary, value: "Synthetic stale note" }] }, 409);
  await denied({ ...(await lease()), operationId: operation("stale-fence"), leaseFence: 1000000,
    edits: [{ operation: "setTeacherNote", teacher: ids.ordinary, value: "Synthetic stale fence note" }] }, 409);
  await denied({ operationId: operation("reader"), versionId, edits: [{ operation: "setReportingOfficer", officer: ids.sat, value: "" }] }, 403, reader);
  await db.prepare("INSERT INTO deploy_versions(school_id,id,name,revision,metadata,created_at) VALUES('synthetic-foreign-school','synthetic-foreign-planning','Synthetic foreign planning',0,'{}',?)").bind(Date.now()).run();
  const foreign = await suite.request(admin, "deploy", "/lease", { method: "POST", body: { operationId: operation("foreign"), versionId: "synthetic-foreign-planning", scope: "meta", clientId } });
  assert.equal(foreign.status, 404);
  const held = await lease();
  await suite.call(admin, "deploy", "/lease", { ...held, operationId: operation("release-before-other-actor"), release: true, fence: held.leaseFence });
  const revoked = await suite.seedAccount("synthetic-planning-revoked", { staffId: ids.ordinary });
  const pending = { ...(await lease(revoked, "synthetic-planning-revoked-client")), operationId: operation("revoked"),
    edits: [{ operation: "setTeacherNote", teacher: ids.ordinary, value: "Synthetic revoked note" }] };
  await core.prepare("DELETE FROM core_grants WHERE school_id=? AND account_id=?").bind(school, revoked.id).run();
  await denied(pending, 403, revoked);
  assert.deepEqual(await authority(), acceptedBefore, "Planning selections never grant Core access or rewrite accepted Contacts/capacity facts");
  assert.deepEqual(await readerCapabilities(), coreCapabilitiesBefore);
  assert.deepEqual(await rows(db, "SELECT * FROM deploy_publications WHERE school_id=? ORDER BY id", school), publicationBefore,
    "Working eligibility edits and duplicate/import operations do not rewrite captured publication history");
  console.log("PASS real planning owner Workers/D1: active staff matrix and SAT×MK Span; no-write reads/first-edit initialization; protected graph/cycle/alias/history handling; organisation/duty/IP eligibility without optional EO; explicit version activity and duplicate refresh; strict school/capability/fence/revision/retry boundaries; unchanged accepted authority");
} finally { await suite.close(); }

// Separate native fixture: publication authority deliberately changes here,
// while the main eligibility fixture above proves that ordinary edits do not.
// It has no fabricated sequence/history row and no enabled provider transport.
async function publicationUsesSelectedVersion() {
  const providerCalls = [];
  const f = await productSuite({ providerFetch: async request => {
    providerCalls.push(new URL(request.url).hostname);
    return new Response("Synthetic provider transport is disabled", { status: 503 });
  } });
  try {
    const admin = await f.seedAccount("synthetic-version-publication-admin");
    const created = await f.call(admin, "contacts", "/save-data", { operationId: operation("publish-staff"), changes: [],
      additions: [{ id: "synthetic-version-publication-row", values: {
        "Basic Name": "Synthetic Version Teacher", "Statutory Name": "Synthetic Version Teacher", Role: "Teacher", Active: "Y",
        "School Section": "Primary", "Personnel Category": "Teaching", "EO Appt Level": "ST",
        "Employment Arrangement": "Full-time", "Employment Modifier": "", "Appointment Status": "Confirmed",
        "Subject Modifier": "", "MK Modifier": "", "Profile Completion": "complete",
      } }],
    });
    const staffId = created.mapping["synthetic-version-publication-row"];
    for (const field of ["eo", "smc", "schoolLeader"])
      await f.call(admin, "contacts", "/staff/" + staffId + "/accept", {
        operationId: operation("publish-initial-authority"), field, value: field === "eo", revision: 0,
        ownerReviewReference: "Synthetic publication authority fixture",
      });
    const { versionId } = await f.call(admin, "deploy", "/versions/create", {
      operationId: operation("publish-create"), name: "Synthetic selected Teacher version", year: 2026,
    });
    const db = await f.db("deploy"), publicationClient = "synthetic-version-publication-client";
    const stored = async id => (await loadVersion(db, school, id || versionId)).doc;
    const lease = async () => {
      const grant = await f.call(admin, "deploy", "/lease", { operationId: operation("publish-lease"), versionId,
        scope: "meta", clientId: publicationClient });
      return { versionId, scope: "meta", clientId: publicationClient, leaseFence: grant.fence };
    };
    const role = (name, flags, eo) => [name, "Synthetic " + name,
      ...["SL", "SC", "SMC", "KP", "TL", "SDT", "CMT", "SAT", "Support", "MK"].map(label => flags.includes(label) ? "1" : ""), "ST", eo];
    await f.call(admin, "deploy", "/change", { ...(await lease()), operationId: operation("publish-matrix"),
      edits: [{ operation: "setRoleMemberships", expected: (await stored()).membership,
        value: [role("Teacher", ["SMC", "KP"], true), role("P", ["SL"], false)] }],
    });
    const source = await stored(), sourcePerson = source.teachers.find(t => t.id === staffId);
    assert.equal(sourcePerson.planningProfile.Role, "Teacher");
    assert.equal(sourcePerson.planningProfile.Active, "Y");
    const initial = (await f.request(admin, "contacts", "/staff/" + staffId)).body.data;
    await f.call(admin, "contacts", "/staff/" + staffId + "/update", {
      operationId: operation("later-contacts-values"), changes: { role: "P", employmentActive: false },
      fieldRevisions: { role: initial.fields.role.revision, employmentActive: initial.fields.employmentActive.revision },
    });
    const fresh = (await f.request(admin, "contacts", "/staff/" + staffId)).body.data;
    assert.equal(fresh.fields.role.value.code || fresh.fields.role.value, "P");
    assert.equal(fresh.fields.employmentActive.value, false);
    const read = await f.call(admin, "deploy", "/bootstrap", { versionId });
    const selectedPerson = read.current.teachers.find(t => t.id === staffId);
    assert.equal(selectedPerson.active, false, "The accepted capacity input is still current Contacts inactive");
    assert.equal(planningPerson(read.current, selectedPerson).active, true);
    assert.equal(planningPerson(read.current, selectedPerson).role, "Teacher");
    const span = await f.call(admin, "deploy", "/export", { versionId, scope: "Span of Control" });
    const spanRow = span.sheets.Hierarchy.rows.find(row => row[0] === staffId);
    assert.equal(spanRow[4], "Teacher");
    assert.equal(spanRow[7], true, "Canonical Span export reflects the selected version snapshot");
    const copy = await f.call(admin, "deploy", "/versions/create", { operationId: operation("publish-duplicate"),
      sourceVersionId: versionId, duplicate: true, name: "Synthetic current-Contacts duplicate" });
    const duplicate = await stored(copy.versionId), duplicatePerson = duplicate.teachers.find(t => t.id === staffId);
    assert.equal(planningPerson(duplicate, duplicatePerson).role, "P");
    assert.equal(planningPerson(duplicate, duplicatePerson).active, false, "Duplication deliberately refreshes current ordinary Role/Active");
    assert.deepEqual(await stored(), source, "Read/export/duplicate do not rewrite the selected source");
    assert.equal((await f.request(admin, "contacts", "/staff/" + staffId)).body.data.fields.smc.value, false,
      "Planning/duplicate selections have not applied authority");

    const publicationInput = { ...(await lease()), operationId: operation("publish-selected"),
      revision: (await stored()).revision, expectedPointerSequence: 0 };
    const published = await f.call(admin, "deploy", "/publish", publicationInput);
    const publication = (await db.prepare("SELECT * FROM deploy_publications WHERE school_id=? AND id=?")
      .bind(school, published.publicationId).all()).results[0];
    const bucket = await f.mf.getR2Bucket("ARTIFACTS", "gsis-deploy");
    const sealedBytes = await (await bucket.get(publication.payload_key)).text();
    const sealed = JSON.parse(sealedBytes), person = sealed.document.teachers.find(t => t.id === staffId);
    assert.equal(person.planningProfile.Role, "Teacher");
    assert.equal(person.planningProfile.Active, "Y");
    assert.deepEqual(person.deploymentTags.Memberships, ["SMC", "KP"]);
    assert.equal(sealed.document.contactsMemberships.find(row => row[0] === staffId)[2], "Teacher");
    assert.equal(sealed.envelope.authorityPublicationVersion, 1);
    const syncInput = { operationId: operation("apply-selected-authority"), requestId: "synthetic-version-publication-transport",
      publicationId: published.publicationId, sourceOperationId: published.operationId || published.requestId || publicationInput.operationId,
      versionId, offset: 0, limit: 8 };
    const applied = await f.call(admin, "deploy", "/memberships/sync", syncInput);
    assert.equal(applied.state, "applied", JSON.stringify(applied));
    assert.equal(applied.completed, 1);
    const accepted = (await f.request(admin, "contacts", "/staff/" + staffId)).body.data;
    assert.equal(accepted.fields.smc.value, true, "Actual authority application uses the selected Teacher row, not current P");
    assert.equal(accepted.fields.schoolLeader.value, false);
    assert.equal(accepted.fields.eo.value, true);
    assert.deepEqual(accepted.fields.memberships.value, ["SMC", "KP"]);
    assert.equal(accepted.fields.role.value.code || accepted.fields.role.value, "P", "This authority receipt is not an ordinary-Role write");
    assert.equal(accepted.fields.employmentActive.value, false);
    assert.deepEqual(await f.call(admin, "deploy", "/memberships/sync", { ...syncInput, requestId: "synthetic-version-publication-retry" }), applied);
    assert.deepEqual((await f.request(admin, "contacts", "/staff/" + staffId)).body.data.fields, accepted.fields,
      "A receipt replay does not repeat the authority application");
    await f.call(admin, "deploy", "/change", { ...(await lease()), operationId: operation("after-publish-note"),
      edits: [{ operation: "setTeacherNote", teacher: staffId, value: "Synthetic later working note", expected: "" }] });
    assert.equal(await (await bucket.get(publication.payload_key)).text(), sealedBytes);
    assert.deepEqual((await db.prepare("SELECT * FROM deploy_publications WHERE school_id=? AND id=?")
      .bind(school, published.publicationId).all()).results[0], publication, "Applied authority and later draft saves leave the immutable capture unchanged");
    assert.deepEqual(providerCalls, [], "No external provider or Google transport is used by the synthetic publication");
  } finally { await f.close(); }
}
await publicationUsesSelectedVersion();
console.log("PASS native publication/receipt application: selected Teacher/Y snapshot wins over later Contacts P/N without granting access from planning; immutable capture retained");
console.log("planning_eligibility_runtime_seconds=" + ((performance.now() - startedAt) / 1000).toFixed(3));
