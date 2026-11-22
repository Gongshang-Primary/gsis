/** Isolated Workers/D1 verification for PR #254 (C18, C06, C25, C26):
 * 1. Existing Deploy draft version ordinary planning profile (Basic Name, Role,
 *    EO Appt Level, Appointment Status, Employment/Subject/MK Modifiers, Active,
 *    Memberships) is insulated from automatic overwrite by subsequent Contacts edits (C18).
 * 2. Live accepted authority/eligibility and Contacts basicNameProvenance continue to
 *    be evaluated from current Contacts.
 * 3. Editing Basic Name in Deploy records server-assigned teacherDraftMeta[staffId].basicNameProvenance
 *    (source: "deploy", changedAt, actorId, operationId) ignoring client timestamps (C06, C25, C26).
 * 4. Duplicate copies current Contacts fields. Explicit refresh preserves saved edits. */
import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";

const suite = await productSuite();
try {
  const admin = await suite.seedAccount("deploy-insulation-admin", {
    capabilities: [
      "admin",
      "contacts.manage",
      "deploy.read",
      "deploy.edit",
      "deploy.publish",
    ],
  });
  const secondAdmin = await suite.seedAccount("deploy-insulation-accepter", {
    capabilities: ["admin", "contacts.manage"],
  });

  // 1. Seed a staff member in Contacts with ordinary planning fields + accepted authority
  const created = await suite.call(admin, "contacts", "/staff/create", {
    operationId: "insul-create-1",
    basicName: "Tan Original",
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
    operationId: "insul-acc-eo",
    field: "eo",
    value: true,
    revision: 0,
    ownerReviewReference: "synthetic-review",
  });

  // 2. Create Deploy draft version V1
  const v1 = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "insul-v1",
    name: "2026 Draft V1",
    year: 2026,
  });
  const v1Id = v1.versionId;
  const boot1 = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1Id,
  });
  const tBefore = boot1.current.teachers.find((t) => t.id === staffId);
  assert.ok(tBefore);
  assert.equal(tBefore.profile["Basic Name"], "Tan Original");
  assert.equal(tBefore.profile.Role, "T");
  assert.equal(tBefore.profile["EO Appt Level"], "GEO3");
  assert.equal(tBefore.profile["Subject Modifier"], "PE");
  assert.equal(tBefore.basicNameProvenance?.source, "contacts");
  assert.equal(tBefore.basicNameProvenance?.value, "Tan Original");
  assert.equal(Number.isSafeInteger(tBefore.basicNameProvenance?.changedAt), true);

  // 3. Edit ordinary planning fields in Contacts AFTER V1 was created
  await suite.call(admin, "contacts", `/staff/${staffId}/update`, {
    operationId: "insul-contacts-edit-1",
    changes: {
      basicName: "Tan Updated In Contacts",
      role: "ST",
      eoAppointmentLevel: "SEO1",
      subjectTags: ["Art"],
    },
  });

  // 4. Reload V1 -> ordinary planning fields MUST remain insulated (C18)!
  const bootAfterContactsEdit = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1Id,
  });
  const tInsulated = bootAfterContactsEdit.current.teachers.find(
    (t) => t.id === staffId,
  );
  assert.equal(tInsulated.planningProfile["Basic Name"], "Tan Original");
  assert.equal(tInsulated.planningProfile.Role, "T");
  assert.equal(tInsulated.planningProfile["EO Appt Level"], "GEO3");
  assert.equal(tInsulated.planningProfile["Subject Modifier"], "PE");
  assert.equal(tInsulated.ttbName, tBefore.ttbName);
  // Contacts provenance, live profile, & authority remain live
  assert.equal(tInsulated.profile["Basic Name"], "Tan Updated In Contacts");
  assert.equal(tInsulated.basicNameProvenance?.value, "Tan Updated In Contacts");
  assert.equal(tInsulated.basicNameProvenance?.source, "contacts");
  assert.equal(tInsulated.authority?.eo?.value, true);
  console.log("PASS C18: existing Deploy draft ordinary planning profile is insulated from subsequent Contacts edits while authority and provenance stay live");

  const workbook = await suite.call(admin, "deploy", "/export", {
    versionId: v1Id,
    scope: "Teachers",
  });
  const sheet = workbook.sheets.Teachers;
  const row = sheet.rows.find((row) => row[0] === staffId);
  assert.equal(row[sheet.columns.indexOf("TTb Name")], tBefore.ttbName);
  assert.equal(row[sheet.columns.indexOf("Basic Name")], "Tan Original");
  assert.equal(row[sheet.columns.indexOf("Subject Modifier")], "PE");
  const preview = await suite.call(admin, "deploy", "/imports/preview", {
    operationId: "insul-teachers-preview",
    versionId: v1Id,
    workbook,
  });
  // An empty Planner Notes row may be added. There are no profile writes.
  assert.deepEqual(preview.diff, { added: 1, removed: 0, changed: 0 });
  console.log("PASS C18: Teachers workbook and unchanged import preview use the saved planning values");

  // 5. Edit Basic Name in Deploy V1 -> server assigns basicNameProvenance (C06, C25, C26)
  const lease1 = await suite.call(admin, "deploy", "/lease", {
    operationId: "insul-lease-1",
    versionId: v1Id,
    scope: "teachers",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/change", {
    operationId: "insul-deploy-name-1",
    versionId: v1Id,
    revision: bootAfterContactsEdit.current.revision,
    scope: "teachers",
    leaseFence: lease1.fence,
    edits: [
      {
        operation: "setTeacherField",
        teacher: staffId,
        field: "Basic Name",
        value: "Tan Edited In Deploy",
        changedAt: 1, // spoofed client timestamp must be ignored
      },
    ],
  });
  const bootAfterDeployEdit = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1Id,
  });
  const meta =
    bootAfterDeployEdit.current.teacherDraftMeta?.[staffId]?.basicNameProvenance;
  assert.ok(meta, "teacherDraftMeta basicNameProvenance must be recorded");
  assert.equal(meta.value, "Tan Edited In Deploy");
  assert.equal(meta.source, "deploy");
  assert.equal(meta.actorId, admin.id);
  assert.equal(meta.operationId, "insul-deploy-name-1");
  assert.ok(
    Number.isSafeInteger(meta.changedAt) && meta.changedAt > 1700000000000,
    "Server-assigned timestamp must be used rather than client timestamp",
  );
  console.log("PASS C06/C25/C26: Deploy Basic Name edit records server-assigned basicNameProvenance");

  const profileLease = await suite.call(admin, "deploy", "/lease", {
    operationId: "insul-profile-lease",
    versionId: v1Id,
    scope: "teachers",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/change", {
    operationId: "insul-deploy-profile-1",
    versionId: v1Id,
    revision: bootAfterDeployEdit.current.revision,
    scope: "teachers",
    leaseFence: profileLease.fence,
    edits: [{
      operation: "upsertTeacherProfile",
      teacher: staffId,
      value: { "Basic Name": meta.value, "Subject Modifier": "Music" },
    }],
  });
  const afterProfileSave = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1Id,
  });
  assert.deepEqual(afterProfileSave.current.teacherDraftMeta[staffId].basicNameProvenance, meta);

  // 6. Duplicate V1 -> V2 refreshes ordinary planning fields from Contacts
  const v2 = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "insul-v2-dup",
    name: "2026 Draft V2",
    year: 2026,
    sourceVersionId: v1Id,
    duplicate: true,
  });
  const bootV2 = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v2.versionId,
  });
  const tV2 = bootV2.current.teachers.find((t) => t.id === staffId);
  assert.equal(tV2.planningProfile["Basic Name"], "Tan Updated In Contacts");
  assert.equal(tV2.planningProfile.Role, "ST");
  assert.equal(tV2.planningProfile["EO Appt Level"], "SEO1");
  assert.equal(tV2.planningProfile["Subject Modifier"], "Art");
  assert.equal(bootV2.current.teacherDrafts?.[staffId], undefined);
  assert.equal(bootV2.current.teacherDraftMeta?.[staffId], undefined);
  console.log("PASS Duplicate refreshes ordinary planning fields from Contacts while keeping V1 insulated");

  // 7. Explicit acceptContacts on V1 refreshes V1 from Contacts
  const leaseMeta = await suite.call(admin, "deploy", "/lease", {
    operationId: "insul-lease-meta",
    versionId: v1Id,
    scope: "meta",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/change", {
    operationId: "insul-v1-accept-contacts",
    versionId: v1Id,
    revision: afterProfileSave.current.revision,
    scope: "meta",
    leaseFence: leaseMeta.fence,
    operation: "acceptContacts",
  });
  const bootV1Refreshed = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1Id,
  });
  const tV1Refreshed = bootV1Refreshed.current.teachers.find(
    (t) => t.id === staffId,
  );
  assert.equal(tV1Refreshed.planningProfile["Basic Name"], "Tan Updated In Contacts");
  assert.equal(tV1Refreshed.planningProfile.Role, "ST");
  assert.equal(tV1Refreshed.planningProfile["EO Appt Level"], "SEO1");
  assert.equal(tV1Refreshed.planningProfile["Subject Modifier"], "Art");
  assert.equal(bootV1Refreshed.current.teacherDrafts[staffId]["Basic Name"], meta.value);
  assert.equal(bootV1Refreshed.current.teacherDrafts[staffId]["Subject Modifier"], "Music");
  assert.deepEqual(bootV1Refreshed.current.teacherDraftMeta[staffId].basicNameProvenance, meta);
  console.log("PASS Explicit acceptContacts refreshes the baseline and retains saved draft edits");
} finally {
  await suite.close();
}
