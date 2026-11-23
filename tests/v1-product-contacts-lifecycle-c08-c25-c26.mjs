/** Isolated Workers/D1 verification for Contacts/Deploy lifecycle follow-ups:
 * - C08: Publishing a Deploy version overwrites all copied deployment tags in
 *   Contacts even when the operator did not touch those tag fields in the draft
 *   and Contacts was edited after the draft was copied (including restoring an
 *   explicitly cleared/blank tag copied into the draft), while leaving
 *   Statutory Name and Mobile No untouched.
 * - C06 / C25: Teachers workbook import records server-assigned
 *   basicNameProvenance (changedAt, source: "deploy", actorId, operationId)
 *   only when Basic Name is genuinely changed; unchanged workbook round-trips
 *   preserve prior provenance without restamping, and cross-draft TTb Name
 *   collisions on workbook import are rejected with 409 DUPLICATE_TTB_NAME.
 * - C26: Two actual Basic Name edits with identical millisecond timestamps
 *   (accepted_at === basicNameChangedAt) resolve deterministically by durable
 *   operationId without trusting client clocks or delivery order. */
import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";
import { schoolId } from "./v1-product/roster-unblock-fixtures.mjs";

const suite = await productSuite({ bindings: { SCHEDULER_OWNER: "v1" } });
try {
  const admin = await suite.seedAccount("c08-c25-c26-admin", {
    capabilities: [
      "admin",
      "contacts.manage",
      "deploy.read",
      "deploy.edit",
      "deploy.publish",
    ],
  });
  const secondAdmin = await suite.seedAccount("c08-c25-c26-accepter", {
    capabilities: ["admin", "contacts.manage"],
  });

  const unwrap = (v) =>
    v && typeof v === "object" && !Array.isArray(v) && v.schemaVersion === 2
      ? v.value
      : v;
  const contactsDb = await suite.db("contacts");
  const readContactsFields = async (staffId) =>
    Object.fromEntries(
      (
        await contactsDb
          .prepare(
            "SELECT field, state, value_json, accepted_at, operation_id FROM contacts_fields WHERE school_id=? AND staff_id=?",
          )
          .bind(schoolId, staffId)
          .all()
      ).results.map((r) => [
        r.field,
        {
          state: r.state,
          value: r.value_json === null ? null : unwrap(JSON.parse(r.value_json)),
          acceptedAt: r.accepted_at,
          operationId: r.operation_id,
        },
      ]),
    );

  // 1. Seed a staff member in Contacts with all 11 deployment tags + Statutory Name + Mobile No + accepted authority
  const created = await suite.call(admin, "contacts", "/staff/create", {
    operationId: "c08-seed-staff",
    basicName: "Lim Baseline",
    statutoryName: "LIM BASELINE STATUTORY",
    mobile: "91234567",
    role: "T",
    eoAppointmentLevel: "GEO3",
    appointmentStatus: "Perm",
    employmentArrangement: "Full-time",
    employmentStatus: "In-service",
    schoolSection: "Primary",
    personnelCategory: "EO",
    employmentActive: true,
    employmentTags: ["Flexi"],
    subjectTags: ["EL", "Math"],
    mkTags: [],
    memberships: ["IP"],
  });
  const staffId = created.result?.staffId || created.staffId;
  assert.ok(staffId);

  // Explicitly clear appointmentStatus in Contacts before copying draft V1 so V1 copies an explicit clear (null)
  await suite.call(admin, "contacts", `/staff/${staffId}/update`, {
    operationId: "c08-clear-appt-before-copy",
    changes: { appointmentStatus: null },
  });

  for (const [field, val] of [
    ["eo", true],
    ["smc", true],
    ["schoolLeader", false],
  ]) {
    await suite.call(secondAdmin, "contacts", `/staff/${staffId}/accept`, {
      operationId: `c08-acc-${field}`,
      field,
      value: val,
      revision: 0,
      ownerReviewReference: "synthetic-owner-review",
    });
  }

  // 2. Create Deploy draft V1 (copies current Contacts tags, including cleared appointmentStatus: null)
  const v1 = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "c08-create-v1",
    name: "2026 C08 Copied Tags V1",
    year: 2026,
  });
  const v1Id = v1.versionId;
  const bootV1 = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1Id,
  });
  const tV1 = bootV1.current.teachers.find((t) => t.id === staffId);
  assert.ok(tV1?.copiedDeploymentTags);
  assert.equal(tV1.copiedDeploymentTags.Role, "T");
  assert.equal(tV1.copiedDeploymentTags["EO Appt Level"], "GEO3");
  assert.equal(tV1.copiedDeploymentTags["Appointment Status"], null);
  assert.equal(tV1.copiedDeploymentTags["Employment Arrangement"], "Full-time");
  assert.equal(tV1.copiedDeploymentTags["Employment Status"], "In-service");
  assert.equal(tV1.copiedDeploymentTags["School Section"], "Primary");
  assert.equal(tV1.copiedDeploymentTags["Personnel Category"], "EO");
  assert.deepEqual(tV1.copiedDeploymentTags["Employment Modifier"], ["Flexi"]);
  assert.deepEqual(tV1.copiedDeploymentTags["Subject Modifier"], ["EL", "Math"]);
  assert.deepEqual(tV1.copiedDeploymentTags["MK Modifier"], []);

  // 3. Edit tags + Statutory Name + Mobile No in Contacts AFTER V1 was copied, without touching V1's teacherDrafts!
  await suite.call(admin, "contacts", `/staff/${staffId}/update`, {
    operationId: "c08-contacts-later-tag-edits",
    changes: {
      statutoryName: "LIM UPDATED STATUTORY",
      mobile: "98887777",
      role: "ST",
      eoAppointmentLevel: "SEO1",
      appointmentStatus: "Contract-Temp",
      employmentArrangement: "Part-time",
      employmentStatus: "Sabbatical",
      personnelCategory: "AED",
      employmentTags: ["Adjunct"],
      subjectTags: ["Sci"],
      mkTags: ["MK-Lead"],
    },
  });

  const midFields = await readContactsFields(staffId);
  assert.equal(midFields.role?.value, "ST");
  assert.equal(midFields.appointmentStatus?.value, "Contract-Temp");
  assert.equal(midFields.employmentArrangement?.value, "Part-time");
  assert.deepEqual(midFields.subjectTags?.value, ["Sci"]);

  // 4. Publish V1 with ZERO teacherDrafts edits -> untouched copied tags must overwrite Contacts back to V1's copied snapshot!
  const bootV1BeforePub = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1Id,
  });
  assert.equal(bootV1BeforePub.current.teacherDrafts?.[staffId], undefined);
  const pubLease1 = await suite.call(admin, "deploy", "/lease", {
    operationId: "c08-pub-lease-1",
    versionId: v1Id,
    scope: "publish",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/publish", {
    operationId: "c08-pub-1",
    versionId: v1Id,
    revision: bootV1BeforePub.current.revision,
    expectedPointerSequence: 0,
    scope: "publish",
    leaseFence: pubLease1.fence,
  });
  await suite.trigger("deploy");
  for (let i = 0; i < 12; i++) await suite.trigger("contacts");

  const afterC08 = await readContactsFields(staffId);
  assert.equal(afterC08.role?.value, "T");
  assert.equal(afterC08.eoAppointmentLevel?.value, "GEO3");
  assert.equal(afterC08.appointmentStatus?.state, "superseded");
  assert.equal(afterC08.appointmentStatus?.value, null);
  assert.equal(afterC08.employmentArrangement?.value, "Full-time");
  assert.equal(afterC08.employmentStatus?.value, "In-service");
  assert.equal(afterC08.schoolSection?.value, "Primary");
  assert.equal(afterC08.personnelCategory?.value, "EO");
  assert.deepEqual(afterC08.employmentTags?.value, ["Flexi"]);
  assert.deepEqual(afterC08.subjectTags?.value, ["EL", "Math"]);
  assert.deepEqual(afterC08.mkTags?.value, []);
  // Statutory Name and Mobile No remain untouched by tag publication
  assert.equal(afterC08.statutoryName?.value, "LIM UPDATED STATUTORY");
  assert.equal(afterC08.mobile?.value, "98887777");
  console.log(
    "PASS C08: publishing a Deploy draft overwrites all untouched copied deployment tags (including copied blank-clears) over later Contacts tag edits while preserving Statutory Name and Mobile No",
  );

  // 5. C06 / C25: Teachers workbook import records server basicNameProvenance on genuine change, not on unchanged import
  const exported1 = await suite.call(admin, "deploy", "/export", {
    versionId: v1Id,
    scope: "Teachers",
  });
  const previewUnchanged = await suite.call(admin, "deploy", "/imports/preview", {
    operationId: "c25-preview-unchanged",
    versionId: v1Id,
    workbook: exported1,
  });
  const leaseTeachers1 = await suite.call(admin, "deploy", "/lease", {
    operationId: "c25-lease-unchanged",
    versionId: v1Id,
    scope: "teachers",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/imports/apply", {
    operationId: "c25-apply-unchanged",
    versionId: v1Id,
    previewId: previewUnchanged.previewId,
    digest: previewUnchanged.digest,
    scope: "teachers",
    leaseFence: leaseTeachers1.fence,
  });
  const afterUnchangedImport = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1Id,
  });
  assert.equal(
    afterUnchangedImport.current.teacherDraftMeta?.[staffId]?.basicNameProvenance,
    undefined,
    "Unchanged workbook import must not restamp or fabricate Deploy basicNameProvenance",
  );

  // Now modify Basic Name in the Teachers workbook and import
  const exported2 = await suite.call(admin, "deploy", "/export", {
    versionId: v1Id,
    scope: "Teachers",
  });
  const sheet2 = exported2.sheets.Teachers;
  const basicCol = sheet2.columns.indexOf("Basic Name");
  const staffRow = sheet2.rows.find((r) => r[0] === staffId);
  assert.ok(staffRow && basicCol >= 0);
  staffRow[basicCol] = "Lim Workbook Renamed";

  const previewChanged = await suite.call(admin, "deploy", "/imports/preview", {
    operationId: "c25-preview-changed",
    versionId: v1Id,
    workbook: exported2,
  });
  assert.equal(previewChanged.diff.added + previewChanged.diff.changed > 0, true);
  const leaseTeachers2 = await suite.call(admin, "deploy", "/lease", {
    operationId: "c25-lease-changed",
    versionId: v1Id,
    scope: "teachers",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/imports/apply", {
    operationId: "c25-apply-changed",
    versionId: v1Id,
    previewId: previewChanged.previewId,
    digest: previewChanged.digest,
    scope: "teachers",
    leaseFence: leaseTeachers2.fence,
  });
  const afterChangedImport = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1Id,
  });
  const wbProv =
    afterChangedImport.current.teacherDraftMeta?.[staffId]?.basicNameProvenance;
  assert.ok(wbProv, "Workbook Basic Name edit must record basicNameProvenance");
  assert.equal(wbProv.value, "Lim Workbook Renamed");
  assert.equal(wbProv.source, "deploy");
  assert.equal(wbProv.operationId, "c25-apply-changed");
  assert.equal(Number.isSafeInteger(wbProv.changedAt), true);

  // Cross-draft TTb Name collision check on workbook import:
  const createdOther = await suite.call(admin, "contacts", "/staff/create", {
    operationId: "c25-reg-other",
    basicName: "Other Distinct Teacher",
    role: "T",
    eoAppointmentLevel: "GEO3",
    appointmentStatus: "Perm",
    schoolSection: "Primary",
    employmentActive: true,
    employmentTags: [],
    subjectTags: [],
    memberships: [],
  });
  const otherId = createdOther.result?.staffId || createdOther.staffId;
  assert.ok(otherId);
  const v2 = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "c25-create-v2",
    name: "2026 C25 Draft V2",
    year: 2026,
  });
  const exportedV2AfterReg = await suite.call(admin, "deploy", "/export", {
    versionId: v2.versionId,
    scope: "Teachers",
  });
  const otherRow = exportedV2AfterReg.sheets.Teachers.rows.find(
    (r) => r[0] === otherId,
  );
  assert.ok(otherRow);
  otherRow[basicCol] = "Lim Workbook Renamed";
  const previewCollision = await suite.call(admin, "deploy", "/imports/preview", {
    operationId: "c25-preview-collision",
    versionId: v2.versionId,
    workbook: exportedV2AfterReg,
  });
  const leaseV2 = await suite.call(admin, "deploy", "/lease", {
    operationId: "c25-lease-v2",
    versionId: v2.versionId,
    scope: "teachers",
    action: "acquire",
  });
  const collisionRes = await suite.request(admin, "deploy", "/imports/apply", {
    method: "POST",
    body: {
      operationId: "c25-apply-collision",
      versionId: v2.versionId,
      previewId: previewCollision.previewId,
      digest: previewCollision.digest,
      scope: "teachers",
      leaseFence: leaseV2.fence,
    },
  });
  assert.equal(collisionRes.status, 409);
  assert.equal(collisionRes.body.error.code, "DUPLICATE_TTB_NAME");
  console.log(
    "PASS C06/C25: Teachers workbook import records server basicNameProvenance only on actual Basic Name changes and enforces cross-draft TTb uniqueness",
  );

  // 6. C26: Deterministic durable tie-breaking when Contacts accepted_at === Deploy basicNameChangedAt
  // Case A: Contacts operation_id ("z-contacts-op") > Deploy basicNameOperationId ("c25-apply-changed") at identical millisecond -> Contacts wins
  await contactsDb
    .prepare(
      "UPDATE contacts_fields SET value_json=?, accepted_at=?, operation_id=? WHERE school_id=? AND staff_id=? AND field='basicName'",
    )
    .bind(
      JSON.stringify("Lim Contacts Equal-Ms Winner"),
      wbProv.changedAt,
      "z-contacts-tiebreak-winner",
      schoolId,
      staffId,
    )
    .run();
  await contactsDb
    .prepare(
      "UPDATE contacts_staff SET basic_name=? WHERE school_id=? AND staff_id=?",
    )
    .bind("Lim Contacts Equal-Ms Winner", schoolId, staffId)
    .run();

  const pubLease2 = await suite.call(admin, "deploy", "/lease", {
    operationId: "c26-pub-lease-a",
    versionId: v1Id,
    scope: "publish",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/publish", {
    operationId: "c26-pub-a",
    versionId: v1Id,
    revision: afterChangedImport.current.revision,
    expectedPointerSequence: 1,
    scope: "publish",
    leaseFence: pubLease2.fence,
  });
  await suite.trigger("deploy");
  for (let i = 0; i < 4; i++) await suite.trigger("contacts");

  const afterTieA = await readContactsFields(staffId);
  assert.equal(afterTieA.basicName?.value, "Lim Contacts Equal-Ms Winner");
  const tieOutcomeA = await contactsDb
    .prepare(
      "SELECT state, outcome_json FROM contacts_contributions WHERE school_id=? AND staff_id=? AND field='basicName' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(schoolId, staffId)
    .first();
  assert.equal(tieOutcomeA.state, "superseded");
  const parsedOutcomeA = JSON.parse(tieOutcomeA.outcome_json);
  assert.equal(parsedOutcomeA.code, "CONTACTS_BASIC_NAME_NEWER");
  assert.equal(parsedOutcomeA.contactsOperationId, "z-contacts-tiebreak-winner");
  assert.equal(parsedOutcomeA.deployOperationId, "c25-apply-changed");

  // Case B: Deploy basicNameOperationId ("c25-apply-changed") > Contacts operation_id ("a-contacts-tiebreak-loser") at identical millisecond -> Deploy wins
  await contactsDb
    .prepare(
      "UPDATE contacts_fields SET value_json=?, accepted_at=?, operation_id=? WHERE school_id=? AND staff_id=? AND field='basicName'",
    )
    .bind(
      JSON.stringify("Lim Contacts Equal-Ms Loser"),
      wbProv.changedAt,
      "a-contacts-tiebreak-loser",
      schoolId,
      staffId,
    )
    .run();

  const bootV1ForB = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1Id,
  });
  const pubLease3 = await suite.call(admin, "deploy", "/lease", {
    operationId: "c26-pub-lease-b",
    versionId: v1Id,
    scope: "publish",
    action: "acquire",
  });
  await suite.call(admin, "deploy", "/publish", {
    operationId: "c26-pub-b",
    versionId: v1Id,
    revision: bootV1ForB.current.revision,
    expectedPointerSequence: 2,
    scope: "publish",
    leaseFence: pubLease3.fence,
  });
  await suite.trigger("deploy");
  for (let i = 0; i < 4; i++) await suite.trigger("contacts");

  const afterTieB = await readContactsFields(staffId);
  assert.equal(afterTieB.basicName?.value, "Lim Workbook Renamed");
  console.log(
    "PASS C26: equal-millisecond Basic Name edits resolve deterministically by durable operationId",
  );
} finally {
  await suite.close();
}
