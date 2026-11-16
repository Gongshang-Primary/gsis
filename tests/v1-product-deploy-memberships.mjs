import assert from "node:assert/strict";
import { join } from "node:path";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";
import { encodeWorkbook, decodeWorkbook } from "../v1/web/shared/workbooks.mjs";

const f = await fixture();
const xml = new JSDOM("");
let restarted, sequence = 0;
const operation = (label) => "synthetic-memberships-" + label + "-" + (++sequence);
try {
  const scenario = await seedScenario(f), [staff, unknown] = scenario.staff;
  const db = await f.db("deploy");
  async function contactUpdate(staffId, changes) {
    const current = (await f.request(f.admin, "contacts", "/staff/" + staffId)).body.data;
    return f.call(f.admin, "contacts", "/staff/" + staffId + "/update", {
      operationId: operation("contact"), changes,
      fieldRevisions: Object.fromEntries(Object.keys(changes).map(key => [key, current.fields[key]?.revision ?? 0])),
    });
  }
  await contactUpdate(staff, { memberships: ["Original Team"] });
  const created = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: operation("create"), name: "Synthetic memberships version", year: Number(scenario.date.slice(0, 4)),
  });
  const versionId = created.versionId;
  const stored = async (id = versionId) => (await loadVersion(db, schoolId, id)).doc;
  const person = (doc, id = staff) => doc.teachers.find(row => row.id === id);
  const members = (doc, id = staff) => person(doc, id).deploymentTags?.Memberships;
  const bootstrap = async () => (await f.call(f.admin, "deploy", "/bootstrap", { versionId })).current;
  assert.deepEqual(members(await stored()), ["Original Team"]);
  assert.equal(members(await stored(), unknown), undefined, "unknown is not an implicit empty list");
  await contactUpdate(unknown, { memberships: ["Later Contacts Group"] });
  assert.equal(members(await bootstrap(), unknown), undefined, "later Contacts values cannot replace a version's unknown state");
  async function lease(id = versionId) {
    const result = await f.call(f.admin, "deploy", "/lease", {
      operationId: operation("lease"), versionId: id, scope: "meta", clientId: "synthetic-membership-client",
    });
    return { versionId: id, scope: "meta", clientId: "synthetic-membership-client", leaseFence: result.fence };
  }
  async function save(edits, extra = {}) {
    const input = { ...(await lease()), operationId: operation("save"), edits, ...extra };
    const result = await f.call(f.admin, "deploy", "/change", input);
    return { input, result };
  }
  const edit = { operation: "setTeacherMemberships", teacher: staff,
    expected: ["Original Team"], value: ["SMC", "Planning & Support", "Planning & Support"] };
  const saved = await save([edit]);
  assert(saved.result.saved);
  assert.deepEqual(members(await stored()), ["SMC", "Planning & Support"]);
  assert.deepEqual(person(await stored()).groups, ["SMC", "Planning & Support"]);
  assert.deepEqual((await f.call(f.admin, "deploy", "/change", saved.input)), saved.result,
    "same request returns original receipt even though lease expired");
  const changedIntent = await f.request(f.admin, "deploy", "/change", { method: "POST",
    body: { ...saved.input, edits: [{ ...edit, value: ["Different"] }] } });
  assert.equal(changedIntent.status, 409, JSON.stringify(changedIntent.body));
  for (const invalid of [
    { ...edit, expected: ["Stale"] },
    { ...edit, expected: ["SMC", "Planning & Support"], value: undefined },
    { ...edit, expected: undefined },
    { ...edit, expected: ["SMC", "Planning & Support"], value: Array.from({ length: 33 }, (_, n) => "Group " + n) },
    { ...edit, expected: ["SMC", "Planning & Support"], value: ["x".repeat(161)] },
    { ...edit, expected: ["SMC", "Planning & Support"], value: ["Invalid\u0000label"] },
    { ...edit, expected: ["SMC", "Planning & Support"], value: ["Planning, Support"] },
    { ...edit, expected: ["SMC", "Planning & Support"], value: ["A; B"] },
    { ...edit, teacher: "foreign-staff", expected: null, value: ["Team"] },
  ]) {
    const response = await f.request(f.admin, "deploy", "/change", { method: "POST", body: {
      ...(await lease()), operationId: operation("invalid"), edits: [invalid],
    } });
    assert(response.status >= 400, JSON.stringify(response.body));
    assert.deepEqual(members(await stored()), ["SMC", "Planning & Support"]);
  }
  const ordinary = await f.seedAccount("synthetic-memberships-reader", { staffId: unknown, capabilities: [] });
  const denied = await f.request(ordinary, "deploy", "/change", { method: "POST", body: {
    operationId: operation("unauthorised"), versionId,
    edits: [{ ...edit, expected: ["SMC", "Planning & Support"], value: [] }],
  } });
  assert.equal(denied.status, 403, JSON.stringify(denied.body));
  const foreign = await f.request(f.admin, "deploy", "/change", { method: "POST", body: {
    ...(await lease()), operationId: operation("foreign-version"), versionId: "foreign-version",
    edits: [{ ...edit, expected: ["SMC", "Planning & Support"], value: [] }],
  } });
  assert.equal(foreign.status, 404, JSON.stringify(foreign.body));

  await contactUpdate(staff, { memberships: ["Current Contacts Team"], subjectTags: ["PE"] });
  let live = await bootstrap();
  assert.deepEqual(members(live), ["SMC", "Planning & Support"], "load must preserve the saved version Memberships");
  assert.deepEqual(person(live).groups, ["SMC", "Planning & Support"]);
  assert.deepEqual(person(live).deploymentTags["Subject Modifier"], ["PE"], "other tags retain current refresh semantics");
  assert.equal(person(live).authority.smc.value, false, "ordinary SMC text cannot grant SMC authority");
  await contactUpdate(staff, { memberships: ["Support"] });
  live = await bootstrap();
  assert.deepEqual(members(live), ["SMC", "Planning & Support"]);
  assert.equal(person(live).teachingEligibility.state, "excluded", "current Contacts exclusions still govern eligibility");
  await contactUpdate(staff, { memberships: ["Current Contacts Team"] });
  const authority = (await f.request(f.admin, "contacts", "/staff/" + staff)).body.data;
  await f.call(f.admin, "contacts", "/staff/" + staff + "/accept", {
    operationId: operation("revoke-eo"), field: "eo", value: false,
    revision: authority.fields.eo.revision, ownerReviewReference: "Synthetic owner review",
  });
  live = await bootstrap();
  assert.equal(person(live).authority.eo.value, false, "current authority is never frozen with version Memberships");
  assert.equal(person(live).teachingEligibility.state, "excluded");
  assert.deepEqual(members(live), ["SMC", "Planning & Support"]);
  await save([{ operation: "setTeacherNote", teacher: staff, expected: "", value: "Synthetic retained note" }]);
  assert.deepEqual(members(await stored()), ["SMC", "Planning & Support"], "unrelated save preserves list");
  const review = await f.call(f.admin, "deploy", "/publishReview", { versionId });
  assert(review, "real publication calculation completes using preserved facts");
  assert.deepEqual(members(await bootstrap()), ["SMC", "Planning & Support"]);

  const exportBook = async () => f.call(f.admin, "deploy", "/export", { versionId, scope: "Membership" });
  const originalWorkbook = await exportBook();
  assert.equal(originalWorkbook.sheets.Membership.rows.find(row => row[0] === staff)[3], "SMC\nPlanning & Support");
  const bytes = await encodeWorkbook(originalWorkbook, { Zip: JSZip });
  const workbook = await decodeWorkbook(bytes, { Zip: JSZip, XMLParser: xml.window.DOMParser });
  assert.deepEqual(workbook.sheets, originalWorkbook.sheets, "real XLSX codec preserves Membership rows");
  async function importBook(book) {
    const preview = await f.call(f.admin, "deploy", "/imports/preview", { operationId: operation("preview"), versionId, workbook: book });
    const input = { ...(await lease()), operationId: operation("import"), previewId: preview.previewId, digest: preview.digest };
    const result = await f.call(f.admin, "deploy", "/imports/apply", input);
    return { input, result };
  }
  await importBook(workbook);
  assert.equal(members(await stored(), unknown), undefined, "untouched blank export never fabricates a known empty record");
  await save([{ operation: "setTeacherMemberships", teacher: unknown, expected: null, value: [] }]);
  assert.deepEqual(members(await stored(), unknown), [], "explicit user empty list turns unknown into known empty");
  let editedWorkbook = await exportBook();
  editedWorkbook.sheets.Membership.rows.find(row => row[0] === staff)[3] = null;
  editedWorkbook.sheets.Membership.rows.find(row => row[0] === unknown)[3] = "Synthetic Committee\nOther free label";
  const imported = await importBook(editedWorkbook);
  assert.deepEqual(members(await stored()), [], "clearing an existing Excel list is explicit");
  assert.deepEqual(members(await stored(), unknown), ["Synthetic Committee", "Other free label"]);
  const stale = await f.request(f.admin, "deploy", "/imports/preview", { method: "POST", body: { operationId: operation("stale-preview"), versionId, workbook } });
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  const wrongSchool = await exportBook(); wrongSchool.metadata["School ID"] = "other-school";
  assert.equal((await f.request(f.admin, "deploy", "/imports/preview", { method: "POST", body: { operationId: operation("foreign-preview"), versionId, workbook: wrongSchool } })).status, 403);
  for (const value of ["Planning, Support", "A; B"]) {
    const invalidWorkbook = await exportBook();
    invalidWorkbook.sheets.Membership.rows.find(row => row[0] === staff)[3] = value;
    const invalid = await f.request(f.admin, "deploy", "/imports/preview", { method: "POST", body: {
      operationId: operation("invalid-delimiter"), versionId, workbook: invalidWorkbook,
    } });
    assert.equal(invalid.status, 400, "reserved delimiters reject instead of silently splitting labels");
  }
  editedWorkbook = await exportBook();
  editedWorkbook.sheets.Membership.rows = editedWorkbook.sheets.Membership.rows.filter(row => row[0] === staff);
  await importBook(editedWorkbook);
  assert.deepEqual(members(await stored(), unknown), ["Synthetic Committee", "Other free label"], "omitted rows are not clears");

  const duplicate = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: operation("duplicate"), copyFrom: versionId, name: "Synthetic duplicate", duplicate: true,
  });
  assert.deepEqual(members(await stored(duplicate.versionId)), ["Current Contacts Team"], "Duplicate refreshes current Contacts Memberships");
  assert.deepEqual(members(await stored(duplicate.versionId), unknown), ["Later Contacts Group"], "Duplicate explicitly refreshes a previously unknown field");
  assert.deepEqual(members(await stored()), [], "Duplicate does not alter source draft");
  await contactUpdate(staff, { memberships: null });
  const reopened = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: operation("new"), name: "Synthetic new version", year: Number(scenario.date.slice(0, 4)),
  });
  assert.equal(members(await stored(reopened.versionId)), null, "new versions retain an explicit Contacts clear");
  const clearedView = await f.call(f.admin, "deploy", "/bootstrap", { versionId: reopened.versionId });
  assert.equal(members(clearedView.current), null);
  assert.deepEqual(person(clearedView.current).groups, []);
  const persisted = await stored();
  await f.stopWorkers();
  restarted = await startProduct({ persistPath: join(f.path, "state"), output: join(f.path, "restarted"), migrateSchemas: false });
  const replay = await restarted.mf.dispatchFetch(origin + "/api/deploy/imports/apply", { method: "POST",
    headers: { origin, cookie: "__Host-gsis_session=" + f.admin.token, "x-csrf-token": f.admin.csrf, "content-type": "application/json" },
    body: JSON.stringify(imported.input) });
  const replayed = await replay.json();
  assert.equal(replay.status, 200, JSON.stringify(replayed));
  assert.deepEqual(replayed.data, imported.result, "restart recovers original import receipt");
  assert.deepEqual((await loadVersion(await restarted.db("deploy"), schoolId, versionId)).doc, persisted);
  console.log("PASS Memberships built Worker/D1: version edits, unknown/clear semantics, current authority, refresh boundaries, XLSX, revision/isolation checks and restart receipt");
} finally { xml.window.close(); await restarted?.close(); await f.close(); }
