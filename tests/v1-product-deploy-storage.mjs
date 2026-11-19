import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import {
  handle,
  loadVersion,
  recoverOperations,
  readContactsDeployment,
} from "../v1/services/deploy/service.mjs";
import { one, query, statement, digest } from "../v1/runtime/store.mjs";
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
    schoolSection: "primary",
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
let venueCatalogue = null;
let onCatalogueRead = null;
let failContacts = false,
  contactsOverride = null,
  contactsRevision = "1";
let onContactsPin = null,
  contactsPinDeadline = null;
let contactsReads = 0,
  contactsPageProvider = null;

let measuredDb = null,
  saveMetrics = null;
function measureOwner(db) {
  const metrics = { statements: 0, maxBindings: 0, jsonBytes: 0 };
  const account = (rows) => {
    metrics.statements += rows.length;
    for (const row of rows) {
      metrics.maxBindings = Math.max(metrics.maxBindings, row.args.length);
      for (const value of row.args)
        if (typeof value === "string" && /^[\[{]/.test(value))
          metrics.jsonBytes += Buffer.byteLength(value);
    }
    assert(
      metrics.statements <= 50,
      "Dependent owner save exceeds the existing 50-statement budget.",
    );
    assert(metrics.maxBindings < 100);
    assert(metrics.jsonBytes < 1024 * 1024);
  };
  const wrap = (native, sql, args = []) => {
    const wrapped = {
      native,
      sql,
      args,
      bind: (...values) => wrap(native.bind(...values), sql, values),
    };
    for (const method of ["first", "all", "run", "raw"])
      wrapped[method] = (...values) => {
        account([wrapped]);
        return native[method](...values);
      };
    return wrapped;
  };
  return {
    metrics,
    db: {
      prepare: (sql) => wrap(db.prepare(sql), sql),
      batch: (rows) => {
        account(rows);
        return db.batch(rows.map((row) => row.native));
      },
    },
  };
}
const env = {
  SCHOOL_ID: school,
  SERVICE_NAME: "deploy",
  GSIS_SECRET: "synthetic-non-production-secret",
  get DB() {
    return measuredDb || h.db;
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
  // Contacts/Core source proofs are synthetic here; the owning Deploy D1,
  // admissions, CAS, audit, receipts and restart are real.
  CONTACTS: {
    fetch: async (request) => {
      const b = await request.json(),
        path = new URL(request.url).pathname;
      if (path.endsWith("/release"))
        return Response.json({
          ok: true,
          data: { pinId: b.pinId, state: "released" },
        });
      if (path.endsWith("/acquire")) {
        contactsPinDeadline = b.validUntil;
        if (onContactsPin) await onContactsPin();
        if (String(b.revision) !== contactsRevision)
          return Response.json(
            {
              ok: false,
              error: {
                code: "SOURCE_REVISION_CHANGED",
                message: "Synthetic accepted facts changed.",
              },
            },
            { status: 409 },
          );
        return Response.json({
          ok: true,
          data: {
            pinId: b.pinId,
            owner: "contacts",
            scope: b.scope,
            revision: b.revision,
            validUntil: b.validUntil,
          },
        });
      }
      contactsReads++;
      if (contactsPageProvider)
        return Response.json({ ok: true, data: await contactsPageProvider(b) });
      if (failContacts) throw Error("synthetic Contacts outage");
      return Response.json({
        ok: true,
        data: contactsOverride || {
          staff,
          revision: "contacts-1",
          sequence: 1,
          asOf: now,
          observation: { evaluationId: "observation-a", asOf: now },
          dependencies: [],
        },
      });
    },
  },
  VENUES: {
    fetch: async (request) => {
      if (failVenues) throw Error("test dependency outage");
      if (new URL(request.url).pathname === "/internal/catalogue") {
        if (onCatalogueRead) await onCatalogueRead();
        return Response.json({ ok: true, data: venueCatalogue });
      }
      return Response.json({
        ok: true,
        data: { state: "committed", fenceId: "venue-fence-a" },
      });
    },
  },
};
const call = async (path, body, p = principal) => {
  const measured =
    body.operationId === "eligibility-classes" ? measureOwner(h.db) : null;
  if (measured) measuredDb = measured.db;
  try {
    return await handle({
      env,
      path,
      body: JSON.parse(JSON.stringify(body)),
      principal: p,
      now,
      method: "POST",
      request: new Request("https://test" + path),
      requestId: crypto.randomUUID(),
    });
  } finally {
    if (measured) {
      saveMetrics = measured.metrics;
      measuredDb = null;
    }
  }
};
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
  const importInput = {
    operationId: "import-apply",
    versionId,
    previewId: preview.previewId,
    digest: preview.digest,
    scope: "meta",
    clientId: "client-a",
    leaseFence: importLease.fence,
  };
  const applied = await call("/imports/apply", importInput);
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
  await statement(
    h.db,
    "UPDATE deploy_previews SET expires_at=? WHERE school_id=? AND id=?",
    [now - 1, school, preview.previewId],
  ).run();
  failContacts = true;
  const beforeReplayReads = contactsReads;
  assert.deepEqual(
    await call("/imports/apply", importInput),
    applied,
    "A committed import replays before expired preview and unavailable source checks.",
  );
  assert.equal(contactsReads, beforeReplayReads);
  await assert.rejects(
    call("/imports/apply", { ...importInput, digest: "different" }),
    (e) => e.code === "OPERATION_INTENT_CONFLICT",
  );
  failContacts = false;
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
  failContacts = true;
  assert.deepEqual(
    await call("/imports/apply", importInput),
    applied,
    "Original committed import survives process restart and source outage.",
  );
  failContacts = false;
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
  // Exercise new teaching references through the actual owner save/import paths.
  const accepted = (value) => ({
    state: "accepted",
    effective: true,
    value,
    revision: "1",
    validFrom: null,
    validUntil: null,
    revoked: false,
  });
  const selectedStaff = {
    staffId: "staff-a",
    basicName: "Shared",
    ttbName: "Shared (BT)",
    active: true,
    fields: Object.fromEntries(
      Object.entries({
        role: "",
        eoAppointmentLevel: "",
        appointmentStatus: "",
        employmentActive: true,
        schoolSection: { code: "primary" },
        employmentArrangement: "Full-time",
        employmentTags: [],
        subjectTags: [],
        mkTags: [],
        memberships: [],
        eo: true,
        smc: false,
        schoolLeader: false,
      }).map(([k, v]) => [k, accepted(v)]),
    ),
  };
  selectedStaff.fields.role = { state: "superseded", effective: false };
  selectedStaff.fields.eoAppointmentLevel = {
    state: "missing",
    effective: false,
  };
  contactsOverride = {
    staff: [selectedStaff],
    revision: "contacts-1",
    sequence: 1,
    asOf: now,
    validUntil: null,
    dependencies: [
      {
        owner: "contacts",
        scope: "staff:staff-a",
        revision: "1",
        validUntil: null,
      },
    ],
  };
  const eligibilityPlan = await call("/versions/create", {
    operationId: "eligibility-create",
    name: "Current accepted teaching facts",
  });
  const eligibilityVersion = eligibilityPlan.versionId;
  await edit(
    eligibilityVersion,
    "eligibility-classes",
    [
      {
        operation: "addClass",
        ref: "eligible-class-a",
        level: "1",
        name: "A",
        shortName: "A",
      },
      {
        operation: "addClass",
        ref: "eligible-class-b",
        level: "2",
        name: "B",
        shortName: "B",
      },
      {
        operation: "addTeacher",
        teacher: "staff-a",
        target: "1A",
        targetRef: "eligible-class-a",
        subject: "EL",
      },
      {
        operation: "addTeacher",
        teacher: "staff-a",
        target: "1A",
        targetRef: "eligible-class-a",
        subject: "FT",
      },
    ],
    0,
  );
  assert(saveMetrics && saveMetrics.statements > 0);
  console.log(
    "PASS dependent owner save strict50 metrics " + JSON.stringify(saveMetrics),
  );
  let eligibleSaved = await loadVersion(h.db, school, eligibilityVersion);
  assert.equal(
    eligibleSaved.doc.teachers[0].teachingEligibility.state,
    "eligible",
  );
  assert.equal(eligibleSaved.doc.teachers[0].quality, "unavailable");
  const originalAssignments = structuredClone(eligibleSaved.doc.assignments);
  selectedStaff.fields.employmentActive.value = false;
  failContacts = true;
  await edit(
    eligibilityVersion,
    "inactive-note-offline",
    [
      {
        operation: "setTeacherNote",
        teacher: "staff-a",
        value: "Keep the historical assignment.",
      },
    ],
    1,
  );
  assert.deepEqual(
    (await loadVersion(h.db, school, eligibilityVersion)).doc.assignments,
    originalAssignments,
    "Unrelated note saves preserve historical references during a source outage.",
  );
  const offline = await call("/bootstrap", { versionId: eligibilityVersion });
  assert.equal(
    offline.current.teachers[0].teachingEligibility.state,
    "unavailable",
  );
  failContacts = false;
  const invalidCases = [
    [
      "inactive",
      () => {
        selectedStaff.fields.employmentActive.value = false;
      },
    ],
    [
      "non-eo",
      () => {
        selectedStaff.fields.eo.value = false;
      },
    ],
    [
      "mk",
      () => {
        selectedStaff.fields.schoolSection.value = { code: "MK" };
      },
    ],
    [
      "pending",
      () => {
        selectedStaff.fields.eo.state = "pending";
      },
    ],
  ];
  for (const [label, alter] of invalidCases) {
    selectedStaff.fields.employmentActive = accepted(true);
    selectedStaff.fields.eo = accepted(true);
    selectedStaff.fields.schoolSection = accepted({ code: "primary" });
    alter();
    const before = await loadVersion(h.db, school, eligibilityVersion);
    const edits = [
      { operation: "setTeacherNote", teacher: "staff-a", value: "Version planning remains available" },
      { operation: "addTeacher", teacher: "staff-a", target: "2B", targetRef: "eligible-class-b", subject: "Math" },
    ];
    if (label === "mk") {
      await assert.rejects(
        edit(eligibilityVersion, "eligibility-" + label, edits, before.version.revision),
        (e) => e.code === "TEACHING_ELIGIBILITY_REQUIRED",
      );
      assert.deepEqual(await loadVersion(h.db, school, eligibilityVersion), before);
      // Lease acquisition is audited separately; no rejected business save exists.
      assert.equal((await one(h.db,
        "SELECT COUNT(*) n FROM product_audit WHERE school_id=? AND operation_id=?",
        [school, "eligibility-" + label])).n, 0);
    } else {
      // The owner's new rule uses explicit version activity and negative tags;
      // current optional EO/capacity facts remain independently unavailable.
      await edit(eligibilityVersion, "eligibility-" + label, edits, before.version.revision);
      const after = await loadVersion(h.db, school, eligibilityVersion);
      assert(after.doc.assignments.some(a => a.targetRef === "eligible-class-b" && a.teacher === "staff-a"));
      assert.equal(after.doc.teacherNotes["staff-a"], "Version planning remains available");
      await edit(eligibilityVersion, "eligibility-cleanup-" + label, [
        { operation: "removeTeacher", teacher: "staff-a", target: "2B", subject: "Math" },
        { operation: "setTeacherNote", teacher: "staff-a", value: before.doc.teacherNotes["staff-a"] || "" },
      ], after.version.revision);
      assert.deepEqual((await loadVersion(h.db, school, eligibilityVersion)).doc.assignments, originalAssignments);
    }
  }
  selectedStaff.fields.employmentActive = accepted(false);
  selectedStaff.fields.eo = accepted(true);
  const oldWorkbook = await call("/export", {
    versionId: eligibilityVersion,
    scope: "IP",
  });
  oldWorkbook.sheets.Classes.rows[0][2] = "Renamed A";
  oldWorkbook.sheets.Classes.rows[0][3] = "R";
  // Simulate a legacy FT binding without targetRef; the codec must preserve its ID.
  const oldFt = originalAssignments.find((a) => a.subject === "FT");
  const legacyFt = { ...oldFt };
  delete legacyFt.targetRef;
  await statement(
    h.db,
    "UPDATE deploy_rows SET value=? WHERE school_id=? AND version_id=? AND scope='assignments' AND row_id=?",
    [JSON.stringify(legacyFt), school, eligibilityVersion, oldFt.id],
  ).run();
  const retainedPreview = await call("/imports/preview", {
    versionId: eligibilityVersion,
    workbook: oldWorkbook,
  });
  const retainedLease = await call("/lease", {
    operationId: "retained-import-lease",
    versionId: eligibilityVersion,
    scope: "meta",
    clientId: "client-a",
  });
  await call("/imports/apply", {
    operationId: "retained-import",
    versionId: eligibilityVersion,
    previewId: retainedPreview.previewId,
    digest: retainedPreview.digest,
    scope: "meta",
    clientId: "client-a",
    leaseFence: retainedLease.fence,
  });
  eligibleSaved = await loadVersion(h.db, school, eligibilityVersion);
  assert.equal(
    eligibleSaved.doc.assignments.find((a) => a.subject === "FT").id,
    oldFt.id,
  );
  assert.equal(
    eligibleSaved.doc.assignments.find((a) => a.subject === "FT").target,
    "1R",
  );
  const imported = await call("/export", {
    versionId: eligibilityVersion,
    scope: "IP",
  });
  imported.sheets.TeachingAssignments.rows[0][2] = "Math";
  const versionActivePreview = await call("/imports/preview", {
    versionId: eligibilityVersion,
    workbook: imported,
  });
  assert(versionActivePreview.previewId,
    "The owner's explicit version Active remains a planning choice; accepted capacity stays separate.");
  selectedStaff.fields.employmentActive = {
    ...accepted(true),
    validUntil: now + 1,
  };
  const activePreview = await call("/imports/preview", {
    versionId: eligibilityVersion,
    workbook: imported,
  });
  contactsOverride.asOf = now + 2; // Same immutable facts/revisions, later observation.
  // A newly MK classification still excludes new planning bindings. Optional
  // accepted activity expiry alone no longer overrides explicit version Active.
  selectedStaff.fields.schoolSection = accepted({ code: "MK" });
  const activeLease = await call("/lease", {
    operationId: "preview-race-lease",
    versionId: eligibilityVersion,
    scope: "meta",
    clientId: "client-a",
  });
  await assert.rejects(
    call("/imports/apply", {
      operationId: "preview-facts-changed",
      versionId: eligibilityVersion,
      previewId: activePreview.previewId,
      digest: activePreview.digest,
      scope: "meta",
      clientId: "client-a",
      leaseFence: activeLease.fence,
    }),
    (e) => e.code === "TEACHING_ELIGIBILITY_REQUIRED",
  );
  assert.deepEqual(
    (await loadVersion(h.db, school, eligibilityVersion)).doc.assignments,
    eligibleSaved.doc.assignments,
  );
  selectedStaff.fields.employmentActive = accepted(true);
  selectedStaff.fields.schoolSection = accepted({ code: "primary" });
  contactsOverride.asOf = now;
  onContactsPin = async () => {
    onContactsPin = null;
    contactsRevision = "2";
  };
  await assert.rejects(
    edit(
      eligibilityVersion,
      "pin-facts-race",
      [
        {
          operation: "addTeacher",
          teacher: "staff-a",
          target: "2B",
          targetRef: "eligible-class-b",
          subject: "Math",
        },
      ],
      eligibleSaved.version.revision,
    ),
    (e) => e.code === "SOURCE_REVISION_CHANGED",
  );
  assert.deepEqual(
    (await loadVersion(h.db, school, eligibilityVersion)).doc.assignments,
    eligibleSaved.doc.assignments,
  );
  contactsRevision = "1";
  onContactsPin = async () => {
    onContactsPin = null;
    await h.db.batch([
      statement(
        h.db,
        "UPDATE deploy_rows SET value=json_set(value,'$.level','3'),revision=revision+1 WHERE school_id=? AND version_id=? AND scope='classes' AND row_id='eligible-class-b'",
        [school, eligibilityVersion],
      ),
      statement(
        h.db,
        "UPDATE deploy_versions SET revision=revision+1 WHERE school_id=? AND id=?",
        [school, eligibilityVersion],
      ),
    ]);
  };
  await assert.rejects(
    edit(eligibilityVersion, "class-scope-race", [
      {
        operation: "addTeacher",
        teacher: "staff-a",
        target: "2B",
        targetRef: "eligible-class-b",
        subject: "Math",
      },
    ]),
    (e) => e.code === "REVISION_CONFLICT",
    "A class/TG scope read participates in the final CAS even without an expected client revision.",
  );
  const scopeRace = await loadVersion(h.db, school, eligibilityVersion);
  assert.deepEqual(scopeRace.doc.assignments, eligibleSaved.doc.assignments);
  assert.equal(
    scopeRace.doc.classes.find((c) => c.ref === "eligible-class-b").level,
    "3",
  );
  // Reconcile the synthetic concurrent class edit before the independent expiry case.
  await h.db.batch([
    statement(
      h.db,
      "UPDATE deploy_rows SET value=json_set(value,'$.level','2'),revision=revision+1 WHERE school_id=? AND version_id=? AND scope='classes' AND row_id='eligible-class-b'",
      [school, eligibilityVersion],
    ),
    statement(
      h.db,
      "UPDATE deploy_versions SET revision=revision+1 WHERE school_id=? AND id=?",
      [school, eligibilityVersion],
    ),
  ]);
  eligibleSaved = await loadVersion(h.db, school, eligibilityVersion);
  const deadline = Date.now() + 160;
  contactsOverride.validUntil = deadline;
  onContactsPin = async () => {
    onContactsPin = null;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, deadline - Date.now() + 20)),
    );
  };
  await assert.rejects(
    edit(
      eligibilityVersion,
      "interval-expired-during-pin",
      [
        {
          operation: "addTeacher",
          teacher: "staff-a",
          target: "2B",
          targetRef: "eligible-class-b",
          subject: "Math",
        },
      ],
      eligibleSaved.version.revision,
    ),
    (e) => e.code === "REVISION_CONFLICT",
  );
  assert.equal(
    contactsPinDeadline,
    deadline,
    "Projection boundary clamps otherwise unbounded staff pins.",
  );
  assert.deepEqual(
    (await loadVersion(h.db, school, eligibilityVersion)).doc.assignments,
    eligibleSaved.doc.assignments,
  );
  assert.equal(
    (
      await one(
        h.db,
        "SELECT COUNT(*) n FROM product_audit WHERE operation_id='interval-expired-during-pin'",
      )
    ).n,
    0,
  );
  // Synthetic bounded page proofs exercise the real consumer; producer HMAC
  // and real source epoch integration are verified in the Contacts program.
  const catalogueDigest = await digest([]);
  const pageStaff = Array.from({ length: 512 }, (_, i) => ({
    ...structuredClone(selectedStaff),
    staffId: i === 0 ? "staff-a" : "staff-z" + String(i).padStart(3, "0"),
  }));
  const pageFor = (offset, total = 512) => ({
    schemaVersion: 1,
    schoolId: school,
    revision: "contacts-paged",
    sequence: 7,
    asOf: now,
    validUntil: null,
    observation: { evaluationId: "page-" + offset, asOf: now },
    staff: structuredClone(
      pageStaff.slice(offset, Math.min(offset + 64, total)),
    ),
    catalogues: [],
    catalogueDigest,
    dependencies: [],
    page: {
      offset,
      total,
      complete: offset + 64 >= total,
      nextCursor: offset + 64 >= total ? null : "cursor-" + (offset + 64),
    },
  });
  const pageOffset = (body) =>
    body.page.cursor === null ? 0 : Number(body.page.cursor.slice(7));
  let pageReads = 0,
    maxPageBytes = 0;
  contactsPageProvider = (body) => {
    pageReads++;
    const page = pageFor(pageOffset(body));
    maxPageBytes = Math.max(
      maxPageBytes,
      new TextEncoder().encode(JSON.stringify(page)).byteLength,
    );
    return page;
  };
  const allStaff = await call("/bootstrap", { versionId: eligibilityVersion });
  assert.equal(allStaff.referenceError, null);
  assert.equal(allStaff.staffCatalog.length, 512);
  assert.equal(new Set(allStaff.staffCatalog.map((t) => t.id)).size, 512);
  assert.deepEqual(allStaff.current.teachers.map((t) => t.id),
    eligibleSaved.doc.teachers.map((t) => t.id),
    "A complete Contacts candidate inventory does not add saved version members.");
  assert.equal(pageReads, 8);
  assert(maxPageBytes < 512 * 1024);
  const pageNegatives = [
    [
      "duplicate",
      (page) => {
        if (page.page.offset) page.staff[0].staffId = "staff-a";
      },
    ],
    [
      "observation-mismatch",
      (page) => {
        page.observation.asOf++;
      },
    ],
    [
      "source-change",
      (page) => {
        if (page.page.offset) page.revision = "contacts-new";
      },
    ],
    [
      "catalogue-change",
      (page) => {
        if (page.page.offset) page.catalogueDigest = "wrong";
      },
    ],
    [
      "skipped-offset",
      (page) => {
        if (page.page.offset) page.page.offset++;
      },
    ],
    [
      "early-complete",
      (page) => {
        page.page.complete = true;
        page.page.nextCursor = null;
      },
    ],
    [
      "repeated-cursor",
      (page) => {
        if (page.page.offset) page.page.nextCursor = "cursor-64";
      },
    ],
    [
      "oversized-total",
      (page) => {
        page.page.total = 513;
      },
    ],
    [
      "oversized-page",
      (page) => {
        page.staff.push(pageStaff[100]);
      },
    ],
    [
      "expired-boundary",
      (page) => {
        page.validUntil = now + 1;
        if (page.page.offset) page.asOf = page.observation.asOf = now + 2;
      },
    ],
  ];
  for (const [label, alter] of pageNegatives) {
    contactsPageProvider = (body) => {
      const page = pageFor(pageOffset(body));
      alter(page);
      return page;
    };
    const rejected = await call("/bootstrap", {
      versionId: eligibilityVersion,
    });
    assert.equal(
      rejected.referenceError?.code,
      label === "source-change" || label === "catalogue-change"
        ? "SOURCE_REVISION_CHANGED"
        : label === "expired-boundary"
          ? "AUTHORITY_CHANGED"
          : "CONTACTS_UNAVAILABLE",
      label,
    );
    assert.equal(
      rejected.current.teachers[0].teachingEligibility.state,
      "unavailable",
      label,
    );
    assert.equal(
      rejected.current.teachers.length,
      eligibleSaved.doc.teachers.length,
      "A partial page collection never replaces the saved reference inventory.",
    );
  }
  contactsPageProvider = null;
  contactsOverride.validUntil = null;
  contactsOverride.staff.push({
    staffId: "staff-provisional",
    basicName: "Provisional",
    ttbName: "Provisional",
    active: null,
    fields: {},
  });
  contactsOverride.dependencies = [
    {
      owner: "contacts",
      scope: "staff:staff-provisional",
      revision: "1",
      validUntil: null,
    },
  ];
  await edit(eligibilityVersion, "provisional-proposal", [
    {
      operation: "upsertTeacherProfile",
      teacher: "staff-provisional",
      profile: { "Basic Name": "Provisional proposed", Active: "Y" },
    },
  ]);
  const proposed = await loadVersion(h.db, school, eligibilityVersion);
  assert.equal(proposed.doc.teacherDrafts["staff-provisional"].Active, "Y");
  assert.equal(
    proposed.doc.teachers.find((t) => t.id === "staff-provisional")
      .teachingEligibility.state,
    "unavailable",
  );
  assert.equal(
    proposed.doc.assignments.some((a) => a.teacher === "staff-provisional"),
    false,
  );
  await edit(eligibilityVersion, "provisional-assignment", [
      {
        operation: "addTeacher",
        teacher: "staff-provisional",
        target: "2B",
        targetRef: "eligible-class-b",
        subject: "Math",
      },
    ]);
  await edit(eligibilityVersion, "provisional-add-existing", [
      {
        operation: "upsertTeacherProfile",
        teacher: "staff-provisional",
        referenceAction: "add-existing",
        profile: { Active: "Y" },
      },
    ]);
  const plannedProvisional = (await loadVersion(h.db, school, eligibilityVersion)).doc;
  assert(plannedProvisional.assignments.some(a => a.teacher === "staff-provisional"),
    "An explicit version Active=Y and a known identity suffice for new planning work without optional EO facts.");
  assert.equal(plannedProvisional.teachers.find(t => t.id === "staff-provisional").teachingEligibility.state,
    "unavailable", "Planning input never fabricates accepted Roster capacity evidence.");
  contactsOverride = null;
  console.log(
    "PASS bounded 512-staff/8-page collector and ten malformed/stale/expired page cases; max encoded page bytes=" +
      maxPageBytes,
  );
  console.log(
    "PASS owner save/import teaching eligibility, retained inactive/legacy FT references, source-change and interval commit fences; committed import expiry/outage/restart replay",
  );

  // Refresh only changes canonical room metadata, even when the source is
  // malformed or a saved planning row changes while the owner is being read.
  const refreshPlan = await call("/versions/create", {
    operationId: "create-venue-refresh",
    name: "Synthetic venue refresh",
  });
  const refreshVersion = refreshPlan.versionId;
  const originalRoom = {
    id: "room-refresh",
    name: "Previous name",
    form: "1A",
    forms: ["1A"],
  };
  const originalClass = {
    ref: "class-refresh",
    level: "1",
    name: "A",
    shortName: "A",
    venueId: originalRoom.id,
  };
  for (const [scope, rowId, value] of [
    ["venues", originalRoom.id, originalRoom],
    ["classes", originalClass.ref, originalClass],
  ])
    await statement(
      h.db,
      "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,?,?,1,?)",
      [school, refreshVersion, scope, rowId, JSON.stringify(value)],
    ).run();
  const goodCatalogue = {
    schemaVersion: 1,
    schoolId: school,
    revision: "catalogue-7",
    asOf: now,
    venues: [
      {
        id: originalRoom.id,
        venueId: originalRoom.id,
        name: "Canonical name",
        unit: "A-01",
        shortName: "A",
        revision: 7,
      },
    ],
  };
  const refreshRequest = async (operationId, revision) => {
    const l = await call("/lease", {
      operationId: operationId + ".lease",
      versionId: refreshVersion,
      scope: "meta",
      clientId: "client-a",
    });
    return {
      operationId,
      operation: "refreshVenueRegistry",
      versionId: refreshVersion,
      ...(revision !== undefined ? { revision } : {}),
      scope: "meta",
      clientId: "client-a",
      leaseFence: l.fence,
    };
  };
  let malformedIndex = 0;
  for (const bad of [
    { ...goodCatalogue, schemaVersion: 2 },
    { ...goodCatalogue, schoolId: "other-school" },
    { ...goodCatalogue, revision: null },
    {
      ...goodCatalogue,
      venues: [goodCatalogue.venues[0], goodCatalogue.venues[0]],
    },
    {
      ...goodCatalogue,
      venues: [{ ...goodCatalogue.venues[0], revision: null }],
    },
    {
      ...goodCatalogue,
      venues: [{ ...goodCatalogue.venues[0], revision: "7" }],
    },
    { ...goodCatalogue, venues: [{ ...goodCatalogue.venues[0], revision: 0 }] },
  ]) {
    venueCatalogue = bad;
    const input = await refreshRequest(
      "malformed-catalogue-" + ++malformedIndex,
      0,
    );
    await assert.rejects(
      call("/change", input),
      (error) => error.code === "SOURCE_INVALID",
    );
    const saved = await loadVersion(h.db, school, refreshVersion);
    assert.equal(saved.version.revision, 0);
    assert.deepEqual(saved.doc.venues, [originalRoom]);
  }
  failVenues = true;
  await assert.rejects(
    call("/change", await refreshRequest("refresh-source-outage", 0)),
    (error) => error.code === "DEPENDENCY_UNAVAILABLE",
  );
  failVenues = false;
  venueCatalogue = { ...goodCatalogue, venues: [] };
  await assert.rejects(
    call("/change", await refreshRequest("refresh-deleted-room", 0)),
    (error) => error.code === "VENUE_REFERENCE_CHANGED",
  );
  assert.deepEqual(
    (await loadVersion(h.db, school, refreshVersion)).doc.venues,
    [originalRoom],
  );

  venueCatalogue = goodCatalogue;
  onCatalogueRead = async () => {
    onCatalogueRead = null;
    await h.db.batch([
      statement(
        h.db,
        "UPDATE deploy_rows SET value=?,revision=revision+1 WHERE school_id=? AND version_id=? AND scope='classes' AND row_id=?",
        [
          JSON.stringify({ ...originalClass, name: "Concurrent class name" }),
          school,
          refreshVersion,
          originalClass.ref,
        ],
      ),
      statement(
        h.db,
        "UPDATE deploy_versions SET revision=revision+1 WHERE school_id=? AND id=?",
        [school, refreshVersion],
      ),
    ]);
  };
  // Even a caller without an explicit expected revision must not overwrite
  // changes made after the refresh's initial saved-document read.
  await assert.rejects(
    call("/change", await refreshRequest("refresh-race")),
    (error) => error.code === "REVISION_CONFLICT",
  );
  let refreshed = await loadVersion(h.db, school, refreshVersion);
  assert.equal(refreshed.version.revision, 1);
  assert.equal(refreshed.doc.classes[0].name, "Concurrent class name");
  assert.deepEqual(refreshed.doc.venues, [originalRoom]);
  const refreshInput = await refreshRequest("refresh-valid", 1);
  const refreshResult = await call("/change", refreshInput);
  assert.equal(refreshResult.workingRevision, 2);
  refreshed = await loadVersion(h.db, school, refreshVersion);
  assert.equal(refreshed.doc.venues[0].revision, 7);
  assert.deepEqual(refreshed.doc.venues[0].forms, originalRoom.forms);
  assert.equal(refreshed.doc.venues[0].form, originalRoom.form);
  assert.equal(refreshed.doc.classes[0].name, "Concurrent class name");
  failVenues = true;
  assert.deepEqual(await call("/change", refreshInput), refreshResult);
  failVenues = false;
  assert.equal(
    (await loadVersion(h.db, school, refreshVersion)).version.revision,
    2,
  );
  console.log(
    "PASS venue refresh validates source evidence, preserves local assignments, rejects stale saved revisions and replays its original receipt without rereading Venues.",
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
