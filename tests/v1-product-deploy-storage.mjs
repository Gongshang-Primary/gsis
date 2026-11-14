import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import {
  handle,
  loadVersion,
  recoverOperations,
  readContactsDeployment,
} from "../v1/services/deploy/service.mjs";
import { one, query, statement } from "../v1/runtime/store.mjs";
const h = await createDatabase("deploy");
const now = Date.now(),
  school = "synthetic-school";
const principal = {
  schoolId: school,
  actorId: "actor-a",
  staffId: "staff-editor",
  sessionId: "session-a",
  impersonating: false,
  capabilities: ["admin", "deploy.read", "deploy.edit", "deploy.publish"],
  decisionId: "decision-a",
  validUntil: now + 3600000,
  revisions: {},
  dependencies: [
    {
      owner: "core",
      scope: "account:actor-a",
      revision: "1",
      validUntil: now + 3600000,
    },
  ],
  requestDigest: "test-request-digest",
  action: "deploy.edit",
};
const staff = [
  {
    staffId: "staff-a",
    name: "Alpha",
    active: true,
    profile: {
      "Basic Name": "Alpha",
      "EO Appt Level": "EO",
      "Employment Modifier": "UT",
      Active: "Y",
    },
    authority: {
      eo: { value: true },
      smc: { value: false },
      schoolLeader: { value: false },
    },
    quality: "verified",
    groups: [],
    fieldRevisions: { eo: "eo-1" },
  },
];
for (let i = 0; i < 22; i++)
  staff.push({
    ...structuredClone(staff[0]),
    staffId: "staff-extra-" + i,
    name: "Extra " + i,
    profile: { ...staff[0].profile, "Basic Name": "Extra " + i },
  });
let failVenues = false;
const env = {
  SCHOOL_ID: school,
  SERVICE_NAME: "deploy",
  GSIS_SECRET: "synthetic-non-production-secret",
  get DB() {
    return h.db;
  },
  get ARTIFACTS() {
    return h.bucket;
  },
  CORE: {
    fetch: async (req) => {
      const b = await req.json(),
        path = new URL(req.url).pathname;
      return Response.json({
        ok: true,
        data: path.endsWith("/release")
          ? { pinId: b.pinId, state: "released" }
          : {
              pinId: b.pinId,
              owner: "core",
              scope: b.scope,
              revision: b.revision,
              validUntil: b.validUntil,
            },
      });
    },
  },
  CONTACTS: {
    fetch: async () =>
      Response.json({
        ok: true,
        data: {
          staff,
          revision: "contacts-1",
          sequence: 1,
          asOf: now,
          observation: { evaluationId: "observation-a", asOf: now },
          dependencies: [],
        },
      }),
  },
  VENUES: {
    fetch: async () => {
      if (failVenues) throw Error("test dependency outage");
      return Response.json({
        ok: true,
        data: { state: "committed", fenceId: "venue-fence-a" },
      });
    },
  },
};
const call = (path, body, p = principal) =>
  handle({
    env,
    path,
    body: JSON.parse(JSON.stringify(body)),
    principal: p,
    now,
    method: "POST",
    request: new Request("https://test" + path),
    requestId: crypto.randomUUID(),
  });
const edit = async (versionId, operationId, edits, revision) => {
  const lease = await call("/lease", {
    operationId: operationId + "-lease",
    versionId,
    scope: "meta",
    clientId: "client-a",
  });
  return call("/change", {
    operationId,
    versionId,
    scope: "meta",
    clientId: "client-a",
    leaseFence: lease.fence,
    revision,
    operation: "saveDraft",
    edits,
  });
};
try {
  const created = await call("/versions/create", {
    operationId: "create-a",
    name: "Synthetic plan",
  });
  assert.equal(created.saved, true);
  const versionId = created.versionId;
  assert.deepEqual(
    await call("/versions/create", {
      operationId: "create-a",
      name: "Synthetic plan",
    }),
    created,
  );
  await assert.rejects(
    call("/versions/create", {
      operationId: "create-a",
      name: "Different intent",
    }),
    (e) => e.code === "OPERATION_INTENT_CONFLICT",
  );
  const snap = await loadVersion(h.db, school, versionId);
  assert.equal(snap.doc.classNameSets.length, 1);
  assert.equal(snap.version.revision, 0);
  await edit(
    versionId,
    "save-note",
    [
      {
        operation: "setTeacherNote",
        teacher: "staff-a",
        expected: "",
        value: "Saved note",
      },
    ],
    0,
  );
  assert.equal(
    (await loadVersion(h.db, school, versionId)).doc.teacherNotes["staff-a"],
    "Saved note",
  );
  const oldLease = await call("/lease", {
    operationId: "lease-old",
    versionId,
    scope: "meta",
    clientId: "client-a",
  });
  await call("/lease", {
    operationId: "release-old",
    versionId,
    scope: "meta",
    clientId: "client-a",
    release: true,
    fence: oldLease.fence,
  });
  const beforeCount = (
    await one(
      h.db,
      "SELECT COUNT(*) AS n FROM product_audit WHERE school_id=?",
      [school],
    )
  ).n;
  await assert.rejects(
    call("/change", {
      operationId: "stale-fence",
      versionId,
      scope: "meta",
      clientId: "client-a",
      leaseFence: oldLease.fence,
      revision: 1,
      operation: "saveDraft",
      edits: [
        {
          operation: "setTeacherNote",
          teacher: "staff-a",
          value: "Must not save",
        },
      ],
    }),
    (e) => e.code === "REVISION_CONFLICT",
  );
  assert.equal(
    (await loadVersion(h.db, school, versionId)).doc.teacherNotes["staff-a"],
    "Saved note",
  );
  assert.equal(
    (
      await one(
        h.db,
        "SELECT COUNT(*) AS n FROM product_audit WHERE school_id=?",
        [school],
      )
    ).n,
    beforeCount,
  );
  // Two disjoint scopes accept independent changes; a whole-version import still uses its saved-base guard.
  const leaseA = await call("/lease", {
    operationId: "lease-a",
    versionId,
    scope: "teacher:staff-a",
    clientId: "client-a",
  });
  const leaseB = await call("/lease", {
    operationId: "lease-b",
    versionId,
    scope: "load:1:EL",
    clientId: "client-a",
  });
  const two = await Promise.all([
    call("/change", {
      operationId: "save-a",
      versionId,
      scope: "teacher:staff-a",
      clientId: "client-a",
      leaseFence: leaseA.fence,
      operation: "saveDraft",
      edits: [
        {
          operation: "setTeacherNote",
          teacher: "staff-a",
          expected: "Saved note",
          value: "Revised note",
        },
      ],
    }),
    call("/change", {
      operationId: "save-b",
      versionId,
      scope: "load:1:EL",
      clientId: "client-a",
      leaseFence: leaseB.fence,
      operation: "saveDraft",
      edits: [
        {
          operation: "setLoad",
          level: "1",
          subject: "EL",
          expected: 0,
          value: 10,
        },
      ],
    }),
  ]);
  assert(two.every((x) => x.saved));
  let updated = await loadVersion(h.db, school, versionId);
  assert.equal(updated.doc.teacherNotes["staff-a"], "Revised note");
  assert.equal(updated.doc.loads["1"].EL, 10);
  const workbook = await call("/export", { versionId, scope: "Offload" });
  const originalRate = workbook.sheets.Offload.rows[0][4];
  workbook.sheets.Offload.rows[0][4] = originalRate === 25 ? 26 : 25;
  const preview = await call("/imports/preview", { versionId, workbook });
  const importLease = await call("/lease", {
    operationId: "import-lease",
    versionId,
    scope: "meta",
    clientId: "client-a",
  });
  const applied = await call("/imports/apply", {
    operationId: "import-apply",
    versionId,
    previewId: preview.previewId,
    digest: preview.digest,
    scope: "meta",
    clientId: "client-a",
    leaseFence: importLease.fence,
  });
  assert.equal(applied.saved, true);
  const afterImport = await loadVersion(h.db, school, versionId);
  assert.equal(
    afterImport.doc.offload.tags[0].percent,
    workbook.sheets.Offload.rows[0][4],
  );
  await assert.rejects(
    call("/imports/apply", {
      operationId: "import-reused-new-op",
      versionId,
      previewId: preview.previewId,
      digest: preview.digest,
      scope: "meta",
      clientId: "client-a",
      leaseFence: importLease.fence,
    }),
    (e) => e.code === "REVISION_CONFLICT",
  );
  assert.equal(
    (await loadVersion(h.db, school, versionId)).version.revision,
    afterImport.version.revision,
  );
  updated = afterImport;
  await assert.rejects(
    call(
      "/change",
      {
        operationId: "preview-write",
        versionId,
        operation: "metadata",
        name: "Forbidden",
      },
      { ...principal, impersonating: true },
    ),
    (e) => e.code === "CAPABILITY_DENIED",
  );
  await assert.rejects(
    loadVersion(h.db, "another-school", versionId),
    (e) => e.code === "NOT_FOUND",
  );
  await edit(
    versionId,
    "bulk-contributions",
    staff.map((t) => ({
      operation: "upsertTeacherProfile",
      teacher: t.staffId,
      profile: {
        "Basic Name": t.name + " proposed",
        Role: "HOD",
        "Appointment Status": "Substantive",
        "Employment Modifier": "Full-time",
        "Subject Modifier": "PE",
        Active: true,
      },
    })),
  );
  updated = await loadVersion(h.db, school, versionId);
  const leaseP = await call("/lease", {
    operationId: "publish-lease",
    versionId,
    scope: "meta",
    clientId: "client-a",
  });
  const publishInput = {
    operationId: "publication-a",
    versionId,
    revision: updated.version.revision,
    expectedPointerSequence: 0,
    scope: "meta",
    clientId: "client-a",
    leaseFence: leaseP.fence,
  };
  const published = await call("/publish", publishInput, {
    ...principal,
    action: "deploy.publish",
  });
  assert.equal(published.state, "committed");
  assert.equal(published.sequence, 1);
  assert.equal(
    (await query(h.db, "SELECT * FROM deploy_deliveries")).length,
    4,
  );
  assert.equal((await query(h.db, "SELECT * FROM product_outbox")).length, 7);
  const chunks = await query(
    h.db,
    "SELECT payload_json FROM product_outbox WHERE type='deploy.contacts' ORDER BY job_id",
  );
  assert.deepEqual(
    chunks.map((r) => JSON.parse(r.payload_json).offset),
    [0, 64, 128],
  );
  assert(chunks.every((r) => JSON.parse(r.payload_json).limit === 64));
  const contactsView = await readContactsDeployment(
    env,
    { schoolId: school },
    now,
  );
  assert.equal(contactsView.available, true);
  assert.equal(contactsView.publicationId, published.publicationId);
  assert.equal("document" in contactsView, false);
  assert.equal("authority" in contactsView, false);
  await assert.rejects(
    readContactsDeployment(env, { schoolId: "foreign" }, now),
    (e) => e.code === "SCHOOL_MISMATCH",
  );
  const historical = await call("/publications", {
    publicationId: published.publicationId,
  });
  assert.equal(historical.document.teacherNotes["staff-a"], "Revised note");
  const capRow = historical.envelope.rows.find((r) => r.staffId === "staff-a");
  assert.equal(capRow.cap, 26);
  assert.equal(capRow.capBasis, "total");
  assert.deepEqual(capRow.capNonTeachingPeriods, { DUTY: 0 });
  assert.deepEqual(historical.envelope.subjectCategories, {});
  await h.restart();
  const activeProjection = await call("/current-publication", {});
  const activeCap = activeProjection.rows.find((r) => r.staffId === "staff-a");
  assert.equal(activeCap.capBasis, "total");
  assert.deepEqual(activeCap.capNonTeachingPeriods, { DUTY: 0 });
  assert.deepEqual(activeProjection.subjectCategories, {});
  const recovered = await call("/receipt", { operationId: "publication-a" });
  assert.equal(recovered.receipt.result.publicationId, published.publicationId);
  assert.equal(
    (await call("/publications", { publicationId: published.publicationId }))
      .digest,
    historical.digest,
  );
  const retry = await call("/publish", publishInput, {
    ...principal,
    action: "deploy.publish",
  });
  assert.equal(retry.publicationId, published.publicationId);
  assert.equal(
    (await query(h.db, "SELECT * FROM deploy_publications")).length,
    1,
  );
  await edit(versionId, "later-save", [
    {
      operation: "setTeacherNote",
      teacher: "staff-a",
      expected: "Revised note",
      value: "Later draft",
    },
  ]);
  assert.equal(
    (await call("/publications", { publicationId: published.publicationId }))
      .document.teacherNotes["staff-a"],
    "Revised note",
  );
  failVenues = true;
  const next = await loadVersion(h.db, school, versionId),
    lp = await call("/lease", {
      operationId: "lease-outage",
      versionId,
      scope: "meta",
      clientId: "client-a",
    });
  await assert.rejects(
    call(
      "/publish",
      {
        operationId: "publication-outage",
        versionId,
        revision: next.version.revision,
        expectedPointerSequence: 1,
        scope: "meta",
        clientId: "client-a",
        leaseFence: lp.fence,
      },
      { ...principal, action: "deploy.publish" },
    ),
    (e) => e.status === 503,
  );
  assert.equal(
    (
      await one(h.db, "SELECT sequence FROM deploy_pointer WHERE school_id=?", [
        school,
      ])
    ).sequence,
    1,
  );
  // A lost preparation response cannot become an implicit abort. Recovery first fences the real writer durably.
  await statement(
    h.db,
    "UPDATE product_operations SET valid_until=? WHERE school_id=? AND operation_id=? AND state='prepared'",
    [now - 1, school, "publication-outage"],
  ).run();
  failVenues = false;
  await h.restart();
  await recoverOperations(env, Date.now());
  const aborted = await call("/receipt", { operationId: "publication-outage" });
  assert.equal(aborted.state, "aborted");
  assert.equal(aborted.saved, false);
  assert.equal(aborted.receipt.state, "terminal-not-committed");
  assert.equal(
    (
      await one(h.db, "SELECT sequence FROM deploy_pointer WHERE school_id=?", [
        school,
      ])
    ).sequence,
    1,
  );
  await assert.rejects(
    call(
      "/publish",
      {
        operationId: "publication-outage",
        versionId,
        revision: next.version.revision,
        expectedPointerSequence: 1,
        scope: "meta",
        clientId: "client-a",
        leaseFence: lp.fence,
      },
      { ...principal, action: "deploy.publish" },
    ),
    (e) => e.code === "OPERATION_ABORTED",
  );
  const row = await one(
    h.db,
    "SELECT payload_key FROM deploy_publications WHERE school_id=? AND id=?",
    [school, published.publicationId],
  );
  await h.bucket.put(row.payload_key, "corrupt");
  await assert.rejects(
    call("/publications", { publicationId: published.publicationId }),
    (e) => e.code === "PAYLOAD_INTEGRITY",
  );
  console.log(
    "PASS actual Workers D1/R2 Deploy drafts, disjoint writes, fenced rollback, immutable publication, receipt retry/restart, dependency outage, atomic import, bounded bulk contribution intents, fenced expiry recovery and payload integrity. Core and Venues are synthetic dependency adapters in this test.",
  );
} finally {
  await h.close();
}
