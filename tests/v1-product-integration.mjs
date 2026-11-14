import assert from "node:assert/strict";
import {
  prepareOperation,
  digest,
  operationStatus,
} from "../v1/runtime/store.mjs";
import { productSuite, origin } from "./v1-product/suite.mjs";
const suite = await productSuite({ bindings: { SCHEDULER_OWNER: "v1" } });
try {
  const admin = await suite.seedAccount("integration-admin");
  let session = await suite.request(admin, "core", "/session");
  assert.equal(session.status, 200, JSON.stringify(session.body));
  assert.equal(session.body.data.user.accountId, admin.id);
  for (const [service, path] of [
    ["contacts", "/bootstrap"],
    ["deploy", "/bootstrap"],
    ["roster", "/profile"],
    ["calendar", "/bootstrap"],
    ["lord", "/reference"],
    ["venues", "/read"],
    ["layout", "/profile"],
  ]) {
    const denied = await suite.request(null, service, path);
    assert(
      [401, 403, 404].includes(denied.status),
      service + JSON.stringify(denied.body),
    );
  }
  assert.equal(
    (
      await suite.request(null, "core", "/internal/authorize", {
        method: "POST",
        body: {},
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await suite.request(null, "core", "/session", {
        headers: {
          "x-gsis-secret": suite.secret,
          "x-admin": "true",
          "x-actor-id": admin.id,
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await suite.request(
        { ...admin, csrf: "wrong" },
        "contacts",
        "/staff/create",
        {
          method: "POST",
          body: { operationId: "csrf-denied", basicName: "Denied" },
        },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await suite.request(admin, "contacts", "/staff/create", {
        method: "POST",
        body: {
          operationId: "other-school",
          schoolId: "foreign",
          basicName: "Denied",
        },
      })
    ).status,
    403,
  );
  const body = {
    operationId: "create-staff",
    staffId: "synthetic-teacher",
    basicName: "Synthetic Teacher",
  };
  const created = await suite.call(admin, "contacts", "/staff/create", body);
  assert.equal(created.state, "committed");
  assert.deepEqual(
    await suite.call(admin, "contacts", "/staff/create", {
      ...body,
      requestId: "new-attempt",
    }),
    created,
  );
  const changedIntent = await suite.request(
    admin,
    "contacts",
    "/staff/create",
    { method: "POST", body: { ...body, basicName: "Changed intent" } },
  );
  assert.equal(changedIntent.status, 409);
  assert.equal(changedIntent.body.error.code, "OPERATION_INTENT_CONFLICT");
  const pendingDb = await suite.db("contacts"),
    originalPending = {
      operationId: "pending-intent",
      staffId: "pending-person",
      basicName: "Original pending",
    };
  await prepareOperation(pendingDb, {
    schoolId: "synthetic-school",
    actorId: admin.id,
    operationId: "pending-intent",
    action: "contacts.manage",
    intent: originalPending,
    now: Date.now(),
    validUntil: Date.now() + 60000,
    authorization: {
      requestDigest: await digest(originalPending),
      action: "contacts.manage",
      decisionId: "original-pending-decision",
    },
  });
  const conflictingPending = await suite.request(
    admin,
    "contacts",
    "/staff/create",
    {
      method: "POST",
      body: { ...originalPending, basicName: "Conflicting retry" },
    },
  );
  assert.equal(conflictingPending.status, 409);
  assert.equal(
    (await operationStatus(pendingDb, "synthetic-school", "pending-intent"))
      .state,
    "prepared",
    "conflicting request must not abort another prepared intent",
  );
  await suite.call(admin, "contacts", "/staff/synthetic-teacher/update", {
    operationId: "activate-staff",
    changes: { employmentActive: true },
    fieldRevisions: { employmentActive: 0 },
  });
  for (const [field, value] of [
    ["smc", true],
    ["eo", true],
    ["schoolLeader", false],
  ])
    await suite.call(admin, "contacts", "/staff/synthetic-teacher/accept", {
      operationId: "accept-" + field,
      field,
      value,
      revision: 0,
      ownerReviewReference: "synthetic-owner-review",
    });
  const teacher = await suite.seedAccount("linked-teacher", {
    staffId: "synthetic-teacher",
    capabilities: [],
  });
  const read = await suite.request(teacher, "deploy", "/bootstrap");
  assert.equal(read.status, 200, JSON.stringify(read.body));
  const version = await suite.call(teacher, "deploy", "/versions/create", {
    operationId: "create-plan",
    name: "Synthetic integrated plan",
  });
  assert(version.versionId);
  const lease = await suite.call(teacher, "deploy", "/lease", {
    operationId: "lease-publish",
    versionId: version.versionId,
    scope: "meta",
    clientId: "synthetic-client",
  });
  assert(lease.fence);
  const published = await suite.call(teacher, "deploy", "/publish", {
    operationId: "publish-plan",
    versionId: version.versionId,
    revision: 0,
    expectedPointerSequence: 0,
    scope: "meta",
    clientId: "synthetic-client",
    leaseFence: lease.fence,
  });
  assert.equal(published.state, "committed");
  assert.equal(published.sequence, 1);
  const receipt = await suite.request(
    teacher,
    "deploy",
    "/receipt?operationId=publish-plan",
  );
  assert.equal(receipt.status, 200);
  assert.equal(
    receipt.body.data.receipt.result.publicationId,
    published.publicationId,
  );
  await suite.trigger("deploy");
  const deliveryDb = await suite.db("deploy");
  const deliveries = await deliveryDb
    .prepare("SELECT recipient,state,last_error FROM deploy_deliveries")
    .all();
  assert.equal(deliveries.results.length, 4);
  assert(
    deliveries.results.every(
      (row) => row.state === "applied" && row.last_error === null,
    ),
    JSON.stringify(deliveries.results),
  );
  const preview = await suite.request(admin, "deploy", "/versions/create", {
    method: "POST",
    headers: { "x-gsis-preview-account": teacher.id },
    body: { operationId: "preview-forbidden", name: "No mutation" },
  });
  assert.equal(preview.status, 403);
  const core = await suite.db("core");
  const events = await core
    .prepare(
      "SELECT COUNT(*) n FROM core_destination_receipts WHERE destination=?",
    )
    .bind("deploy")
    .first();
  assert(events.n >= 3);
  const deploy = await suite.db("deploy");
  assert.equal(
    (await deploy.prepare("SELECT COUNT(*) n FROM deploy_publications").first())
      .n,
    1,
  );
  const contacts = await suite.db("contacts");
  assert.equal(
    (
      await contacts
        .prepare("SELECT COUNT(*) n FROM source_pins WHERE state='held'")
        .first()
    ).n,
    0,
    "committed writes resolve Contacts pins",
  );
  console.log(
    "PASS actual nine-Worker Service Bindings: opaque sessions, CSRF/school/forgedheader/internal-route/preview denial; Contacts acceptance→Core/T1A→Deploy publication→durable receipt/evidence",
  );
} finally {
  await suite.close();
}
