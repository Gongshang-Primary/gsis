import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";

const suite = await productSuite();
try {
  const admin = await suite.seedAccount("hrpub-admin");
  const editorOnly = await suite.seedAccount("hrpub-editor", {
    capabilities: ["deploy.read", "deploy.edit"],
  });

  // 1. Seed a staff member in Contacts with an out-of-catalogue Appointment Status ("Seconded").
  const createdStaff = await suite.call(admin, "contacts", "/save-data", {
    operationId: "hrpub-staff-1",
    changes: [],
    additions: [
      {
        id: "tmp-hr-1",
        values: {
          "Basic Name": "Synthetic Tan",
          "Statutory Name": "Synthetic Tan",
          "EO Appt Level": "EO",
          Role: "Teacher",
          Active: "Y",
          "School Section": "Primary",
          "Employment Modifier": "FAJT",
          "Employment Arrangement": "Full-time",
          "Appointment Status": "Seconded",
          "Subject Modifier": "",
          "MK Modifier": "",
          "Personnel Category": "Teaching",
          "Profile Completion": "complete",
        },
      },
    ],
  });
  const staffId = createdStaff.mapping["tmp-hr-1"];
  assert.ok(staffId);

  // 2. Create Deploy Version A and edit its HR Terms (with explicitly empty MK Modifier: []).
  const vA = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "hrpub-create-a",
    name: "Version A",
    year: 2026,
  });
  let leaseSeq = 0;
  async function leaseFor(versionId, scope = "planning") {
    const lease = await suite.call(admin, "deploy", "/lease", {
      operationId: `hrpub-lease-${++leaseSeq}`,
      versionId,
      scope,
      clientId: "hrpub-client",
    });
    return { versionId, scope, clientId: "hrpub-client", leaseFence: lease.fence };
  }

  async function currentChoices(versionId) {
    const boot = await suite.request(
      admin,
      "deploy",
      `/bootstrap?versionId=${encodeURIComponent(versionId)}`,
    );
    assert.equal(boot.status, 200);
    return boot.body.data.sysFields;
  }

  const expectedA = await currentChoices(vA.versionId);
  const savedA = await suite.call(admin, "deploy", "/change", {
    ...(await leaseFor(vA.versionId, "meta")),
    operation: "setHRChoices",
    revision: 0,
    operationId: "hrpub-terms-a",
    expected: expectedA,
    value: {
      ...expectedA,
      "EO Appt Level": ["EO", "SEO1"],
      "Appointment Status": ["Confirmed", "Contract"],
      "Employment Modifier": ["FAJT", "4/5"],
      "Subject Modifier": ["MTL", "PE"],
      "MK Modifier": [],
    },
  });
  assert.equal(savedA.saved, true);

  // Draft saves MUST NOT mutate Contacts catalogues!
  const beforePublish = await suite.request(admin, "contacts", "/hr-terms");
  assert.equal(beforePublish.status, 200);
  assert.deepEqual(beforePublish.body.data.lists, {});

  // Create Deploy Version B with independent HR Terms.
  const vB = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "hrpub-create-b",
    name: "Version B",
    year: 2026,
  });
  const expectedB = await currentChoices(vB.versionId);
  const savedB = await suite.call(admin, "deploy", "/change", {
    ...(await leaseFor(vB.versionId, "meta")),
    operation: "setHRChoices",
    revision: 0,
    operationId: "hrpub-terms-b",
    expected: expectedB,
    value: {
      ...expectedB,
      "EO Appt Level": ["EO", "SEO2"],
      "Appointment Status": ["Confirmed", "Seconded"],
      "Employment Modifier": ["UT"],
      "Subject Modifier": ["Art"],
      "MK Modifier": ["MK"],
    },
  });
  assert.equal(savedB.saved, true);

  // 3. Explicitly publish Version A, then sync HR Terms to Contacts.
  const pubAOpId = "hrpub-publish-a";
  const pubA = await suite.call(admin, "deploy", "/publish", {
    ...(await leaseFor(vA.versionId, "meta")),
    revision: 1,
    expectedPointerSequence: 0,
    operationId: pubAOpId,
  });
  assert.equal(pubA.state, "committed");

  // Non-publisher denied /hr-terms/sync.
  const deniedSync = await suite.request(editorOnly, "deploy", "/hr-terms/sync", {
    method: "POST",
    body: {
      operationId: "hrpub-sync-denied",
      versionId: vA.versionId,
      publicationId: pubA.publicationId,
      sourceOperationId: pubAOpId,
    },
  });
  assert.ok([403, 503].includes(deniedSync.status));

  const syncAOpId = "hrpub-sync-a-1";
  const syncA = await suite.call(admin, "deploy", "/hr-terms/sync", {
    operationId: syncAOpId,
    versionId: vA.versionId,
    publicationId: pubA.publicationId,
    sourceOperationId: pubAOpId,
  });
  assert.equal(syncA.state, "applied");
  assert.equal(syncA.staffValuesMutated, false);
  assert.ok(syncA.updatedFields.includes("Appointment Status"));
  assert.ok(syncA.updatedFields.includes("MK Modifier"));

  // 15 Nov retain-and-flag rule: staff's "Seconded" value is flagged AND retained untouched!
  const flaggedSeconded = syncA.flaggedStaffValues.find(
    (f) => f.staffId === staffId && f.field === "Appointment Status" && f.value === "Seconded",
  );
  assert.ok(flaggedSeconded, "Out-of-catalogue staff value must be flagged");
  assert.equal(flaggedSeconded.retained, true);
  assert.equal(flaggedSeconded.reason, "OUT_OF_PUBLISHED_CATALOGUE");

  // Verify Contacts stored Version A's catalogues with explicit empty MK Modifier preserved.
  const afterA = await suite.request(admin, "contacts", "/hr-terms");
  assert.equal(afterA.status, 200);
  assert.deepEqual(afterA.body.data.lists["Appointment Status"], ["Confirmed", "Contract"]);
  assert.deepEqual(afterA.body.data.lists["MK Modifier"], []);
  assert.equal(afterA.body.data.provenance["MK Modifier"].explicitlyEmpty, true);

  // Verify staff record's "Seconded" value is still untouched in Contacts!
  const staffRow = await suite.request(admin, "contacts", `/staff/${staffId}`);
  assert.equal(staffRow.status, 200);
  assert.ok(
    JSON.stringify(staffRow.body.data).includes("Seconded"),
    "Retained out-of-catalogue staff value must still exist in Contacts",
  );

  // Idempotent retry of syncA returns stored receipt with zero extra revisions.
  const syncAReplay = await suite.call(admin, "deploy", "/hr-terms/sync", {
    operationId: syncAOpId,
    versionId: vA.versionId,
    publicationId: pubA.publicationId,
    sourceOperationId: pubAOpId,
  });
  assert.equal(syncAReplay.state, "applied");
  const afterReplay = await suite.request(admin, "contacts", "/hr-terms");
  assert.deepEqual(afterReplay.body.data.revisions, afterA.body.data.revisions);

  // 4. Publish Version B (sequence 2) and sync -> updates Contacts to Version B.
  const pubBOpId = "hrpub-publish-b";
  const pubB = await suite.call(admin, "deploy", "/publish", {
    ...(await leaseFor(vB.versionId, "meta")),
    revision: 1,
    expectedPointerSequence: 1,
    operationId: pubBOpId,
  });
  assert.equal(pubB.state, "committed");

  const syncB = await suite.call(admin, "deploy", "/hr-terms/sync", {
    operationId: "hrpub-sync-b-1",
    versionId: vB.versionId,
    publicationId: pubB.publicationId,
    sourceOperationId: pubBOpId,
  });
  assert.equal(syncB.state, "applied");
  const afterB = await suite.request(admin, "contacts", "/hr-terms");
  assert.deepEqual(afterB.body.data.lists["Employment Modifier"], ["UT"]);
  assert.deepEqual(afterB.body.data.lists["MK Modifier"], ["MK"]);

  // Delayed older publication (Version A, sequence 1) cannot overwrite newer Version B (sequence 2)!
  const delayedA = await suite.call(admin, "deploy", "/hr-terms/sync", {
    operationId: "hrpub-sync-a-delayed",
    versionId: vA.versionId,
    publicationId: pubA.publicationId,
    sourceOperationId: pubAOpId,
  });
  assert.equal(delayedA.state, "applied"); // Wait: contacts returns cached idempotent receipt for pubA OR superseded for a different older pub!
  const afterDelayed = await suite.request(admin, "contacts", "/hr-terms");
  assert.deepEqual(
    afterDelayed.body.data.lists["Employment Modifier"],
    ["UT"],
    "Older publication must never overwrite newer published Contacts catalogues",
  );

  console.log(
    "PASS v1 Deploy-to-Contacts HR Terms catalogue publication (draft isolation, explicit empty, retain-and-flag, idempotency, monotonic ordering)",
  );
} finally {
  await suite.close();
}
