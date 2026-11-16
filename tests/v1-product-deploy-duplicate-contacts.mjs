import assert from "node:assert/strict";
import { join } from "node:path";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

const f = await fixture();
let restarted;
try {
  const s = await seedScenario(f), db = await f.db("deploy");
  const partial = await f.call(f.admin, "contacts", "/save-data", {
    operationId: "synthetic-partial-copy", changes: [],
    additions: [{ id: "synthetic-partial-row", values: { "Basic Name": "Synthetic Partial Person" } }],
  });
  const partialId = partial.mapping["synthetic-partial-row"];
  const source = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-original-plan", name: "Synthetic original", year: Number(s.date.slice(0, 4)),
  });
  const initial = await loadVersion(db, schoolId, source.versionId);
  // Synthetic fixture for an existing planning version. Duplicate itself is
  // invoked by the real built control and writes through the real owner API.
  const doc = structuredClone(initial.doc), draftId = "synthetic-draft-only-person";
  doc.classes = [{ ref: "synthetic-class", name: "Synthetic class", shortName: "1S", level: "1" }];
  doc.assignments = [{ id: "synthetic-assignment", target: "1S", targetRef: "synthetic-class",
    subject: "EL", teacher: s.staff[0] }];
  doc.teacherNotes[s.staff[0]] = "Synthetic planner note only";
  doc.teachers.push({ ...structuredClone(doc.teachers[0]), id: draftId, name: "Synthetic draft-only person",
    ttbName: "Synthetic draft-only person", profile: { ...doc.teachers[0].profile,
      "Basic Name": "Synthetic draft-only person", "TTb Name": "Synthetic draft-only person" } });
  const delta = changesFor(schoolId, source.versionId, initial.rows, doc);
  await db.batch(delta.writes.map(w => statement(db, w.sql, w.args)));
  const before = await loadVersion(db, schoolId, source.versionId);
  async function update(id, changes, operationId) {
    const current = (await f.request(f.admin, "contacts", "/staff/" + id)).body.data;
    return f.call(f.admin, "contacts", "/staff/" + id + "/update", { operationId, changes,
      fieldRevisions: Object.fromEntries(Object.keys(changes).map(k => [k, current.fields[k]?.revision ?? 0])) });
  }
  await update(s.staff[0], { employmentTags: ["UT"], subjectTags: ["PE"], mkTags: ["Synthetic MK label"],
    role: "ST", eoAppointmentLevel: "EO", appointmentStatus: "Confirmed", memberships: ["Synthetic Committee"],
    employmentArrangement: "4/5", employmentStatus: "Synthetic temporary", schoolSection: "Primary",
    personnelCategory: "Teaching", employmentActive: false }, "synthetic-update-eleven-tags");
  await update(s.staff[1], { employmentStatus: "Synthetic old status", personnelCategory: "Teaching" }, "synthetic-before-clears");
  await update(s.staff[1], { employmentTags: [], employmentStatus: null, personnelCategory: null }, "synthetic-explicit-clears");
  const contactsBefore = (await f.request(f.admin, "contacts", "/staff/" + s.staff[0])).body.data;
  const contactsDb = await f.db("contacts");
  const storedContact = async () => ({
    staff: await contactsDb.prepare("SELECT * FROM contacts_staff WHERE school_id=? AND staff_id=?").bind(schoolId, s.staff[0]).first(),
    fields: (await contactsDb.prepare("SELECT * FROM contacts_fields WHERE school_id=? AND staff_id=? ORDER BY field").bind(schoolId, s.staff[0]).all()).results,
  });
  const storedBefore = await storedContact();
  const page = await f.pageFor();
  const dialogs = [];
  page.on("dialog", async d => {
    dialogs.push({ type: d.type(), message: d.message() });
    if (d.type() === "prompt") await d.accept("Synthetic refreshed copy"); else await d.dismiss();
  });
  await page.goto(origin + "/deploy/");
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#version")?.selectedOptions[0]?.textContent.includes("Synthetic refreshed copy"));
  const copyId = await page.locator("#version").inputValue();
  assert.notEqual(copyId, source.versionId);
  assert.equal(dialogs.filter(d => d.type === "alert").length, 0, JSON.stringify(dialogs));
  const copied = await loadVersion(db, schoolId, copyId);
  const person = copied.doc.teachers.find(t => t.id === s.staff[0]);
  const expected = { "Employment Modifier": ["UT"], "Subject Modifier": ["PE"], "MK Modifier": ["Synthetic MK label"],
    Role: "ST", "EO Appt Level": "EO", "Appointment Status": "Confirmed", Memberships: ["Synthetic Committee"],
    "Employment Arrangement": "4/5", "Employment Status": "Synthetic temporary", "School Section": "Primary",
    "Personnel Category": "Teaching" };
  assert.deepEqual(person.deploymentTags, expected, "Duplicate must retain every typed tag separately from the legacy display projection");
  assert.equal(person.active, false, "inactive teachers remain in the refreshed version");
  assert.equal(person.profile["Employment Modifier"], "4/5;UT", "legacy calculation/display input is unchanged");
  assert.deepEqual(person.groups, expected.Memberships);
  const cleared = copied.doc.teachers.find(t => t.id === s.staff[1]).deploymentTags;
  assert.deepEqual(cleared["Employment Modifier"], []);
  assert.equal(cleared["Employment Status"], null);
  assert.equal(cleared["Personnel Category"], null);
  assert.equal(person.fieldRevisions.employmentStatus, contactsBefore.fields.employmentStatus.revision);
  assert.equal(person.fieldRevisions.personnelCategory, contactsBefore.fields.personnelCategory.revision);
  const partialTags = copied.doc.teachers.find(t => t.id === partialId).deploymentTags;
  assert(!Object.hasOwn(partialTags, "Employment Status"), "unknown is not an invented explicit clear");
  assert.deepEqual(copied.doc.assignments, before.doc.assignments);
  assert.deepEqual(copied.doc.teacherNotes, before.doc.teacherNotes);
  const retained = copied.doc.teachers.find(t => t.id === draftId);
  assert.deepEqual(retained.profile, before.doc.teachers.find(t => t.id === draftId).profile);
  assert.equal(retained.id, draftId);
  assert.deepEqual((await loadVersion(db, schoolId, source.versionId)).doc, before.doc, "Duplicate never rewrites its source version");
  assert.deepEqual(await storedContact(), storedBefore,
    "copying is not a Contacts edit or a new name-edit timestamp");

  const creation = f.requests.find(r => r.input?.name === "Synthetic refreshed copy" && r.status === 200);
  assert(creation, "the built Duplicate control reaches the owner Worker");
  const path = new URL(creation.url).pathname.replace("/api/deploy", "");
  const replay = await f.request(f.admin, "deploy", path, { method: "POST", body: creation.input });
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.data.versionId, copyId);
  assert.equal((await f.request(f.admin, "deploy", path, { method: "POST",
    body: { ...creation.input, name: "Different intent" } })).status, 409);
  const reader = await f.seedAccount("synthetic-duplicate-reader", { staffId: s.staff[1], capabilities: [] });
  assert.equal((await f.request(reader, "deploy", "/versions/create", { method: "POST",
    body: { operationId: "synthetic-denied-duplicate", copyFrom: source.versionId, name: "Forbidden" } })).status, 403);
  await db.prepare("INSERT INTO deploy_versions(school_id,id,name,revision,metadata,created_at) VALUES('foreign-school','synthetic-foreign-version','Synthetic foreign',0,'{}',?)")
    .bind(Date.now()).run();
  assert.equal((await f.request(f.admin, "deploy", "/versions/create", { method: "POST",
    body: { operationId: "synthetic-foreign-duplicate", copyFrom: "synthetic-foreign-version", name: "Forbidden" } })).status, 404);

  // Clear evidence must be a current, owned ordinary-field operation. These
  // local fixture variants exercise the real projection boundary, not a helper.
  const clear = await contactsDb.prepare(
    "SELECT valid_from,valid_until,operation_id FROM contacts_fields WHERE school_id=? AND staff_id=? AND field='personnelCategory'")
    .bind(schoolId, s.staff[1]).first();
  for (const [from, until, operation] of [
    [Date.now() + 86400000, null, clear.operation_id],
    [Date.now() - 86400000, Date.now() - 1000, clear.operation_id],
    [clear.valid_from, clear.valid_until, ""],
  ]) {
    await contactsDb.prepare("UPDATE contacts_fields SET valid_from=?,valid_until=?,operation_id=? WHERE school_id=? AND staff_id=? AND field='personnelCategory'")
      .bind(from, until, operation, schoolId, s.staff[1]).run();
    const projection = await f.call(f.admin, "contacts", "/projection", { purpose: "deploy", schoolId });
    assert.notEqual(projection.staff.find(t => t.staffId === s.staff[1]).fields.personnelCategory.cleared, true);
  }
  await contactsDb.prepare("UPDATE contacts_fields SET valid_from=?,valid_until=?,operation_id=? WHERE school_id=? AND staff_id=? AND field='personnelCategory'")
    .bind(clear.valid_from, clear.valid_until, clear.operation_id, schoolId, s.staff[1]).run();

  await f.stopWorkers();
  restarted = await startProduct({ persistPath: join(f.path, "state"), output: join(f.path, "restarted"), migrateSchemas: false });
  const response = await restarted.mf.dispatchFetch(origin + "/api/deploy" + path, { method: "POST",
    headers: { origin, cookie: "__Host-gsis_session=" + f.admin.token, "x-csrf-token": f.admin.csrf,
      "content-type": "application/json" }, body: JSON.stringify(creation.input) });
  const recovered = await response.json();
  assert.equal(response.status, 200, JSON.stringify(recovered));
  assert.equal(recovered.data.versionId, copyId);
  assert.deepEqual((await loadVersion(await restarted.db("deploy"), schoolId, copyId)).doc, copied.doc);
  assert.equal((await (await restarted.db("deploy")).prepare("SELECT COUNT(*) n FROM deploy_versions WHERE school_id=?").bind(schoolId).first()).n, 2);
  console.log("PASS built Duplicate control / nine Workers / D1: all eleven typed tags, refreshed inactive/partial people, exact clears, assignments/notes/IDs, authority/isolation and restart receipt recovery");
} finally { await restarted?.close(); await f.close(); }
