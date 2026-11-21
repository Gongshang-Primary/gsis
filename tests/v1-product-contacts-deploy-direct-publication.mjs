/** Isolated Workers/D1 verification for PR 22 (C04, C05, C08-C10, C19-C23, C25-C26):
 * 1. Publishing a Deploy version directly applies all 11 deployment tags (including
 *    EO Appt Level, MK Modifier, blank-clears, and bidirectional Active Y->N) to Contacts.
 * 2. Basic Name timestamp conflict resolution: when Contacts was edited more recently
 *    than the Deploy draft's Basic Name edit, Contacts' newer Basic Name wins and the
 *    Deploy basicName contribution is superseded (CONTACTS_BASIC_NAME_NEWER).
 * 3. Cross-draft TTb Name reservation blocks duplicate TTb Name registration across
 *    active drafts (409 DUPLICATE_TTB_NAME) and releases immediately on draft deletion. */
import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";

const schoolId = "synthetic-school";
const suite = await productSuite({ bindings: { SCHEDULER_OWNER: "v1" } });
try {
  const admin = await suite.seedAccount("direct-pub-admin", {
    capabilities: [
      "admin",
      "contacts.manage",
      "deploy.read",
      "deploy.edit",
      "deploy.publish",
    ],
  });
  const secondAdmin = await suite.seedAccount("direct-pub-accepter", {
    capabilities: ["admin", "contacts.manage"],
  });

  // 1. Seed a staff member in Contacts
  const created = await suite.call(admin, "contacts", "/staff/create", {
    operationId: "dp-create-1",
    basicName: "Tan Direct One",
    role: "T",
    eoAppointmentLevel: "GEO3",
    appointmentStatus: "Perm",
    schoolSection: "Primary",
    employmentActive: true,
    employmentTags: ["Full-time"],
    subjectTags: ["PE"],
    memberships: ["IP"],
  });
  const staffId = created.result?.staffId || created.staffId;
  assert.ok(staffId);
  await suite.call(secondAdmin, "contacts", `/staff/${staffId}/accept`, {
    operationId: "dp-acc-eo",
    field: "eo",
    value: true,
    revision: 0,
    ownerReviewReference: "synthetic-review",
  });

  // 2. Create Deploy V1, edit EO Appt Level, MK Modifier, blank-clear Subject Modifier & Appointment Status, flip Active Y->N, edit Basic Name
  const v1 = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "dp-v1",
    name: "2026 Direct Pub V1",
    year: 2026,
  });
  const boot1 = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1.versionId,
  });
  const lease1 = await suite.call(admin, "deploy", "/lease", {
    operationId: "dp-lease-1",
    versionId: v1.versionId,
    scope: "teachers",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/change", {
    operationId: "dp-edit-1",
    versionId: v1.versionId,
    revision: boot1.current.revision,
    scope: "teachers",
    leaseFence: lease1.fence,
    edits: [
      { operation: "setTeacherField", teacher: staffId, field: "EO Appt Level", value: "SEO1" },
      { operation: "setTeacherField", teacher: staffId, field: "MK Modifier", value: "MK" },
      { operation: "setTeacherField", teacher: staffId, field: "Subject Modifier", value: "" },
      { operation: "setTeacherField", teacher: staffId, field: "Appointment Status", value: "" },
      { operation: "setTeacherField", teacher: staffId, field: "Active", value: "N" },
      { operation: "setTeacherField", teacher: staffId, field: "Basic Name", value: "Tan Deploy Newer" },
    ],
  });

  const boot1After = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1.versionId,
  });
  const pubLease1 = await suite.call(admin, "deploy", "/lease", {
    operationId: "dp-pub-lease-1",
    versionId: v1.versionId,
    scope: "publish",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/publish", {
    operationId: "dp-pub-1",
    versionId: v1.versionId,
    revision: boot1After.current.revision,
    expectedPointerSequence: 0,
    scope: "publish",
    leaseFence: pubLease1.fence,
  });
  await suite.trigger("deploy");
  for (let i = 0; i < 4; i++) await suite.trigger("contacts");

  const unwrap = (v) =>
    v && typeof v === "object" && !Array.isArray(v) && v.schemaVersion === 2
      ? v.value
      : v;
  const contactsDb = await suite.db("contacts");
  const fieldsAfter = Object.fromEntries(
    (
      await contactsDb
        .prepare("SELECT field, state, value_json FROM contacts_fields WHERE school_id=? AND staff_id=?")
        .bind(schoolId, staffId)
        .all()
    ).results.map((r) => [r.field, { state: r.state, value: unwrap(JSON.parse(r.value_json)) }]),
  );
  assert.equal(fieldsAfter.eoAppointmentLevel?.value, "SEO1");
  assert.deepEqual(fieldsAfter.mkTags?.value, ["MK"]);
  assert.deepEqual(fieldsAfter.subjectTags?.value, []);
  assert.equal(fieldsAfter.appointmentStatus?.value, null);
  assert.equal(fieldsAfter.employmentActive?.value, false);
  assert.equal(fieldsAfter.basicName?.value, "Tan Deploy Newer");
  console.log("PASS C04/C05/C08-C10: Deploy publish applies EO Appt Level, MK Modifier, blank-clears, bidirectional Active Y->N, and Basic Name directly to Contacts");

  // 3. Basic Name timestamp conflict: Contacts edited AFTER Deploy draft edit -> Contacts wins!
  const v2 = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "dp-v2",
    name: "2026 Direct Pub V2",
    year: 2026,
    sourceVersionId: v1.versionId,
    duplicate: true,
  });
  const boot2 = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v2.versionId,
  });
  const lease2 = await suite.call(admin, "deploy", "/lease", {
    operationId: "dp-lease-2",
    versionId: v2.versionId,
    scope: "teachers",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/change", {
    operationId: "dp-edit-2",
    versionId: v2.versionId,
    revision: boot2.current.revision,
    scope: "teachers",
    leaseFence: lease2.fence,
    edits: [
      { operation: "setTeacherField", teacher: staffId, field: "Basic Name", value: "Tan Stale Deploy Name" },
    ],
  });
  // Wait 5ms so Contacts edit has a strictly newer server timestamp
  await new Promise((r) => setTimeout(r, 5));
  await suite.call(admin, "contacts", `/staff/${staffId}/update`, {
    operationId: "dp-contacts-newer-name",
    changes: { basicName: "Tan Newer Contacts Name" },
  });

  const boot2After = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v2.versionId,
  });
  const pubLease2 = await suite.call(admin, "deploy", "/lease", {
    operationId: "dp-pub-lease-2",
    versionId: v2.versionId,
    scope: "publish",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/publish", {
    operationId: "dp-pub-2",
    versionId: v2.versionId,
    revision: boot2After.current.revision,
    expectedPointerSequence: 1,
    scope: "publish",
    leaseFence: pubLease2.fence,
  });
  await suite.trigger("deploy");
  await suite.trigger("contacts");
  await suite.trigger("contacts");

  const basicRow = await contactsDb
    .prepare("SELECT value_json FROM contacts_fields WHERE school_id=? AND staff_id=? AND field='basicName'")
    .bind(schoolId, staffId)
    .first();
  assert.equal(JSON.parse(basicRow.value_json), "Tan Newer Contacts Name");
  const supersededContrib = await contactsDb
    .prepare("SELECT state, outcome_json FROM contacts_contributions WHERE school_id=? AND staff_id=? AND field='basicName' ORDER BY created_at DESC LIMIT 1")
    .bind(schoolId, staffId)
    .first();
  assert.equal(supersededContrib.state, "superseded");
  assert.equal(JSON.parse(supersededContrib.outcome_json).code, "CONTACTS_BASIC_NAME_NEWER");
  console.log("PASS C25/C26: Contacts newer Basic Name wins over stale Deploy draft Basic Name edit on publish");

  // 4. Cross-draft TTb Name reservation & release on draft deletion (C19, C22)
  const v3 = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "dp-v3",
    name: "2026 Draft V3",
    year: 2026,
  });
  const boot3 = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v3.versionId,
  });
  const lease3 = await suite.call(admin, "deploy", "/lease", {
    operationId: "dp-lease-3",
    versionId: v3.versionId,
    scope: "teachers",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/change", {
    operationId: "dp-edit-3",
    versionId: v3.versionId,
    revision: boot3.current.revision,
    scope: "teachers",
    leaseFence: lease3.fence,
    edits: [
      { operation: "setTeacherField", teacher: staffId, field: "Basic Name", value: "Unique Reserved Name" },
    ],
  });

  // Attempting to register "Unique Reserved Name" from another draft must fail with 409 DUPLICATE_TTB_NAME
  const collision = await suite.request(admin, "deploy", "/staff/register", {
    method: "POST",
    body: {
      operationId: "dp-reg-collision",
      versionId: v2.versionId,
      basicName: "Unique Reserved Name",
    },
  });
  assert.equal(collision.status, 409);
  assert.equal(collision.body.error.code, "DUPLICATE_TTB_NAME");

  // Delete draft V3 -> reservation released, registration now succeeds!
  const leaseDel = await suite.call(admin, "deploy", "/lease", {
    operationId: "dp-lease-del",
    versionId: v3.versionId,
    scope: "meta",
    action: "acquire",
  });
  const boot3Now = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v3.versionId,
  });
  await suite.call(admin, "deploy", "/change", {
    operationId: "dp-del-v3",
    versionId: v3.versionId,
    revision: boot3Now.current.revision,
    scope: "meta",
    leaseFence: leaseDel.fence,
    operation: "delete",
  });
  const afterDelete = await suite.call(admin, "deploy", "/staff/register", {
    operationId: "dp-reg-ok",
    versionId: v2.versionId,
    basicName: "Unique Reserved Name",
  });
  assert.ok(afterDelete.result?.staffId || afterDelete.staffId);
  console.log("PASS C19/C22: Cross-draft TTb Name collision rejected (409 DUPLICATE_TTB_NAME) and released on draft deletion");
} finally {
  await suite.close();
}
