import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { handle as core, authorizeCore } from "../v1/services/core/service.mjs";
import {
  handle as contacts,
  readAuthorityProjection,
} from "../v1/services/contacts/service.mjs";
import {
  digest,
  query,
  one,
  statement,
  prepareOperation,
  commitOperation,
  operationStatus,
} from "../v1/runtime/store.mjs";
import {
  admit,
  resolveAdmission,
  requireMembership,
} from "../v1/runtime/admission.mjs";
import { backupOwner, restoreOwner } from "../v1/runtime/backup.mjs";
import { processContribution } from "../v1/services/contacts/contributions.mjs";
import { authorizeRosterSchedule } from "../v1/services/core/scheduler.mjs";
const c = await createDatabase("core"),
  p = await createDatabase("contacts");
let now = Date.now();
const base = {
  SCHOOL_ID: "synthetic-school",
  SCHOOL_NAME: "Synthetic school",
  HOSTED_DOMAIN: "example.test",
  PUBLIC_ORIGIN: "https://school.example.test",
  GSIS_SECRET: "local-test-only-integration-secret",
};
const ce = { ...base, DB: c.db, SERVICE_NAME: "core" },
  pe = { ...base, DB: p.db, SERVICE_NAME: "contacts" };
const envs = { core: ce, contacts: pe };
function binding(service) {
  return {
    fetch: async (request) => {
      const env = envs[service];
      try {
        await requireMembership(env, request);
        const path = new URL(request.url).pathname,
          body = await request.json();
        let data;
        if (path === "/internal/operation-status")
          data = await operationStatus(env.DB, body.schoolId, body.operationId);
        else
          data = await (service === "core" ? core : contacts)({
            env,
            path,
            body,
            method: "POST",
            request,
            internal: true,
            now: Date.now(),
          });
        return Response.json({ ok: true, data });
      } catch (e) {
        return Response.json(
          { ok: false, error: { code: e.code ?? "ERROR", message: e.message } },
          { status: e.status ?? 500 },
        );
      }
    },
  };
}
for (const env of Object.values(envs)) {
  env.CORE = binding("core");
  env.CONTACTS = binding("contacts");
}
async function seedAccount(id, staffId, caps = ["admin"]) {
  const token = `opaque-${id}`,
    csrf = `csrf-${id}`;
  await statement(
    ce.DB,
    "INSERT INTO core_accounts(school_id,account_id,issuer,subject,email,staff_id,created_at) VALUES(?,?,'https://accounts.google.com',?,?,?,?)",
    [base.SCHOOL_ID, id, `google-${id}`, `${id}@example.test`, staffId, now],
  ).run();
  for (const cap of caps)
    await statement(
      ce.DB,
      "INSERT INTO core_grants(school_id,account_id,capability,valid_from) VALUES(?,?,?,0)",
      [base.SCHOOL_ID, id, cap],
    ).run();
  await statement(
    ce.DB,
    "INSERT INTO core_sessions(school_id,session_id,token_hash,account_id,authenticated_at,expires_at,csrf_token) VALUES(?,?,?,?,?,?,?)",
    [
      base.SCHOOL_ID,
      `session-${id}`,
      await digest(token),
      id,
      now - 100,
      now - 100 + 864000000,
      csrf,
    ],
  ).run();
  return { token, csrf, id };
}
let serial = 0;
async function authorize(user, service, action, body = {}, write = true) {
  return authorizeCore(
    ce,
    {
      schoolId: base.SCHOOL_ID,
      sessionToken: user.token,
      csrfToken: user.csrf,
      origin: base.PUBLIC_ORIGIN,
      descriptor: {
        service,
        action,
        write,
        operationId: body.operationId,
        bodyDigest: await digest(body),
        requestId: `request-${++serial}`,
      },
    },
    Date.now(),
  );
}
async function call(user, path, body, action = "contacts.manage") {
  body = { operationId: `operation-${++serial}`, ...body };
  const principal = await authorize(user, "contacts", action, body);
  return contacts({
    env: pe,
    path,
    method: "POST",
    body,
    principal,
    request: new Request(base.PUBLIC_ORIGIN + "/api/contacts" + path),
    now: Date.now(),
  });
}
try {
  const admin = await seedAccount("admin-a", "staff-admin"),
    pu = await seedAccount("power-user", "staff-pu", ["contacts.powerUser"]);
  // Full user -> Core durable evidence -> Core pin -> Contacts actual D1 mutation.
  const created = await call(admin, "/staff/create", {
    staffId: "teacher-a",
    basicName: "Synthetic Teacher",
  });
  assert.equal(created.state, "committed");
  assert.equal(created.result.staffId, "teacher-a");
  assert.equal(
    (await one(pe.DB, "SELECT COUNT(*) n FROM contacts_snapshots")).n,
    3,
  );
  const initial = await one(
    pe.DB,
    "SELECT revision FROM contacts_staff WHERE staff_id=?",
    ["teacher-a"],
  );
  await call(admin, "/staff/teacher-a/update", {
    changes: { employmentActive: true },
    fieldRevisions: { employmentActive: 0 },
  });
  for (const [field, value] of [
    ["smc", true],
    ["eo", true],
    ["schoolLeader", false],
  ])
    await call(pu, "/staff/teacher-a/accept", {
      field,
      value,
      revision: 0,
      ownerReviewReference: "owner-review",
    });
  assert.equal(
    (await one(pe.DB, "SELECT COUNT(*) n FROM contacts_acceptance_audit")).n,
    3,
  );
  const teacher = await seedAccount("teacher-account", "teacher-a", []);
  const allowed = await authorize(teacher, "deploy", "deploy.publish", {
    operationId: "publish-check",
  });
  assert(allowed.capabilities.includes("deploy.publish"));
  assert.equal(allowed.dependencies.length, 2);
  const evidence = await one(
    ce.DB,
    "SELECT evidence_json,event_json FROM core_evidence WHERE decision_id=?",
    [allowed.decisionId],
  );
  const chain = JSON.parse(evidence.evidence_json);
  assert.equal(chain.contacts.kind, "observed");
  assert.equal(chain.contacts.snapshot.staffId, "teacher-a");
  assert.equal(chain.contacts.snapshot.fields.schoolLeader[0].value, false);
  assert.equal(
    JSON.parse(evidence.event_json).contactsRevision,
    chain.contacts.snapshot.revision,
  );
  // A second unchanged read has the same content identity and a separate exact observation.
  const second = await authorize(teacher, "deploy", "deploy.read", {}, false);
  const chain2 = JSON.parse(
    (
      await one(
        ce.DB,
        "SELECT evidence_json FROM core_evidence WHERE decision_id=?",
        [second.decisionId],
      )
    ).evidence_json,
  );
  assert.equal(chain2.contacts.contentDigest, chain.contacts.contentDigest);
  assert.notEqual(
    chain2.contacts.observation.evaluationId,
    chain.contacts.observation.evaluationId,
  );
  console.log(
    "PASS CT01/CT02 real owner acceptance and F5 identity versus observation",
  );
  // Self acceptance, including another Google account linked to the same permanent ID.
  const self = await seedAccount("self-admin", "teacher-a");
  await assert.rejects(
    () =>
      call(self, "/staff/teacher-a/accept", {
        field: "smc",
        value: false,
        revision: 1,
        ownerReviewReference: "owner-review",
      }),
    (e) => e.code === "SELF_ACCEPTANCE_DENIED",
  );
  // An active provisional person blocks, an explicitly inactive one does not.
  await call(admin, "/staff/create", {
    staffId: "inactive-a",
    basicName: "Synthetic Inactive",
  });
  await call(admin, "/staff/inactive-a/update", {
    changes: { employmentActive: false },
    fieldRevisions: { employmentActive: 0 },
  });
  let manager = await authorize(
    admin,
    "contacts",
    "contacts.manage",
    {},
    false,
  );
  let scan = await contacts({
    env: pe,
    path: "/readiness",
    method: "GET",
    body: {},
    principal: manager,
    now: Date.now(),
  });
  assert.equal(scan.state, "ready");
  assert.equal(scan.inactive.length, 1);
  await call(admin, "/staff/inactive-a/update", {
    changes: { employmentActive: true },
    fieldRevisions: { employmentActive: 1 },
  });
  const incomplete = await seedAccount("reactivated-account", "inactive-a", []);
  await assert.rejects(
    () => authorize(incomplete, "deploy", "deploy.read", {}, false),
    (e) => e.code === "AUTHORITY_EVIDENCE_MISSING" && e.status === 403,
  );
  let checked = await contacts({
    env: pe,
    path: "/readiness/check",
    method: "POST",
    body: { report: scan },
    principal: manager,
    now: Date.now(),
  });
  assert.equal(checked.ready, false);
  console.log("PASS CT03 inactive exclusion and reactivation invalidation");
  const gridBody = {
    operationId: "grid-both",
    changes: [
      {
        id: "teacher-a",
        field: "Basic Name",
        expected: "Synthetic Teacher",
        value: "Synthetic Renamed",
      },
      {
        id: "inactive-a",
        field: "Basic Name",
        expected: "Synthetic Inactive",
        value: "Synthetic Reactivated",
      },
    ],
    additions: [],
  };
  const grid = await call(admin, "/save-data", gridBody);
  assert.equal(grid.saved, true);
  assert.equal(
    (
      await one(
        pe.DB,
        "SELECT basic_name FROM contacts_staff WHERE staff_id=?",
        ["teacher-a"],
      )
    ).basic_name,
    "Synthetic Renamed",
  );
  const wrong = {
    operationId: "grid-invalid-all",
    changes: [
      {
        id: "teacher-a",
        field: "Basic Name",
        expected: "Synthetic Renamed",
        value: "Never Written",
      },
      {
        id: "inactive-a",
        field: "Basic Name",
        expected: "wrong",
        value: "Also Never",
      },
    ],
    additions: [],
  };
  await assert.rejects(
    () => call(admin, "/save-data", wrong),
    (e) => e.code === "REVISION_CONFLICT",
  );
  assert.equal(
    (
      await one(
        pe.DB,
        "SELECT basic_name FROM contacts_staff WHERE staff_id=?",
        ["teacher-a"],
      )
    ).basic_name,
    "Synthetic Renamed",
  );
  const replay = await call(admin, "/save-data", gridBody);
  assert.deepEqual(replay.receipt, grid.receipt);
  await assert.rejects(
    () =>
      call(
        teacher,
        "/save-diy",
        {
          changes: [
            {
              id: "inactive-a",
              field: "Mobile No",
              expected: "",
              value: "+6500000000",
            },
          ],
        },
        "contacts.self",
      ),
    (e) => e.code === "CAPABILITY_DENIED",
  );
  await call(
    teacher,
    "/save-diy",
    {
      changes: [
        {
          id: "teacher-a",
          field: "Mobile No",
          expected: "",
          value: "+6500000001",
        },
      ],
    },
    "contacts.self",
  );
  console.log(
    "PASS Contacts grid atomic multi-row save, stale-cell whole-batch refusal, idempotent receipt and self-only DIY",
  );

  // Catalogue display lifecycle is atomic with new immutable references.
  const tags = {
    catalogueId: "employment-tags",
    revision: "1",
    kind: "operational-tag",
    entries: [
      {
        code: "BT",
        label: "BT",
        active: true,
        definitionRevision: "bt-1",
        category: "employmentTags",
        ttbVisible: true,
        order: 1,
      },
      {
        code: "hidden",
        label: "Hidden",
        active: true,
        definitionRevision: "hidden-1",
        category: "employmentTags",
        ttbVisible: false,
        order: 0,
      },
    ],
  };
  await call(pu, "/catalogues", { revision: 0, catalogue: tags });
  await call(pu, "/staff/teacher-a/update", {
    changes: {
      employmentTags: [
        { catalogueId: tags.catalogueId, revision: "1", code: "BT" },
        { catalogueId: tags.catalogueId, revision: "1", code: "hidden" },
      ],
    },
  });
  assert.equal(
    (
      await one(pe.DB, "SELECT ttb_name FROM contacts_staff WHERE staff_id=?", [
        "teacher-a",
      ])
    ).ttb_name,
    "Synthetic Renamed (BT)",
  );
  const priorDisplay = await one(
    pe.DB,
    "SELECT body FROM contacts_snapshots WHERE staff_id=? AND profile='display' ORDER BY sequence DESC LIMIT 1",
    ["teacher-a"],
  );
  await call(pu, "/catalogues", {
    revision: 1,
    catalogue: {
      ...tags,
      revision: "2",
      entries: tags.entries.map((e) =>
        e.code === "BT"
          ? { ...e, label: "Beginning Teacher", active: false }
          : e,
      ),
    },
  });
  assert.equal(
    (
      await one(pe.DB, "SELECT ttb_name FROM contacts_staff WHERE staff_id=?", [
        "teacher-a",
      ])
    ).ttb_name,
    "Synthetic Renamed (Beginning Teacher)",
  );
  assert.equal(
    JSON.parse(priorDisplay.body).fields.ttbName[0].value,
    "Synthetic Renamed (BT)",
  );
  await assert.rejects(
    () =>
      call(pu, "/staff/inactive-a/update", {
        changes: {
          employmentTags: [
            { catalogueId: tags.catalogueId, revision: "2", code: "BT" },
          ],
        },
      }),
    (e) => e.code === "TAG_RETIRED",
  );
  // A future accepted replacement retains the current interval; no read increments content.
  const future = Date.now() + 86400000,
    eoBefore = await one(
      pe.DB,
      "SELECT revision FROM contacts_fields WHERE staff_id=? AND field='eo'",
      ["teacher-a"],
    );
  await call(pu, "/staff/teacher-a/accept", {
    field: "eo",
    value: false,
    revision: eoBefore.revision,
    validFrom: future,
    ownerReviewReference: "owner-review",
  });
  const currentAuthority = await readAuthorityProjection(
    pe,
    {
      schoolId: base.SCHOOL_ID,
      staffId: "teacher-a",
      profile: "authority",
      evaluationId: "scheduled-now",
    },
    Date.now(),
  );
  const futureAuthority = await readAuthorityProjection(
    pe,
    {
      schoolId: base.SCHOOL_ID,
      staffId: "teacher-a",
      profile: "authority",
      evaluationId: "scheduled-future",
    },
    future + 1,
  );
  assert.equal(currentAuthority.read.snapshot.fields.eo.length, 1);
  assert.equal(currentAuthority.read.snapshot.fields.eo[0].value, true);
  assert.equal(currentAuthority.read.snapshot.fields.eo[0].validUntil, future);
  assert.equal(futureAuthority.read.snapshot.fields.eo[0].value, false);
  assert.notEqual(
    currentAuthority.read.snapshot.snapshotId,
    futureAuthority.read.snapshot.snapshotId,
  );
  assert.equal(currentAuthority.staffRevision, futureAuthority.staffRevision);
  assert(
    (
      await authorize(teacher, "deploy", "deploy.publish", {
        operationId: "before-scheduled-change",
      })
    ).validUntil <= future,
  );
  console.log(
    "PASS catalogues retire assignments without changing history; future acceptance preserves preceding interval and unchanged read identity",
  );
  // Immutable publication proof is injected here; Core and Contacts stores/authorization are real D1.
  const publishPrincipal = await authorize(admin, "deploy", "deploy.publish", {
    operationId: "source-publication",
  });
  const baseName = await one(
    pe.DB,
    "SELECT revision FROM contacts_fields WHERE staff_id='inactive-a' AND field='basicName'",
  );
  const source = {
    publicationId: "publication-1",
    sourceOperationId: "source-publication",
    sourceDigest: "d".repeat(64),
    sourceFence: 1,
  };
  const proposals = [
    {
      staffId: "inactive-a",
      field: "basicName",
      proposedValue: "Contribution Applied",
      acceptedBaseFieldRevision: baseName.revision,
      validFrom: Date.now(),
      sourcePublicationId: source.publicationId,
      sourceOperationId: source.sourceOperationId,
      originalActorId: admin.id,
    },
    {
      staffId: "inactive-a",
      field: "employmentActive",
      proposedValue: false,
      acceptedBaseFieldRevision: 0,
      validFrom: Date.now(),
      sourcePublicationId: source.publicationId,
      sourceOperationId: source.sourceOperationId,
      originalActorId: admin.id,
    },
  ];
  const deployProof = {
    fetch: async (request) => {
      await requireMembership(ce, request);
      const b = await request.json();
      assert.equal(b.sourceDigest, source.sourceDigest);
      return Response.json({
        ok: true,
        data: {
          state: "committed",
          ...source,
          decisionId: publishPrincipal.decisionId,
          sequence: 1,
          contributions: proposals,
        },
      });
    },
  };
  ce.DEPLOY = deployProof;
  pe.DEPLOY = deployProof;
  const delivered = await contacts({
    env: pe,
    internal: true,
    path: "/internal/contributions",
    method: "POST",
    body: {
      schoolId: base.SCHOOL_ID,
      ...source,
      operationId: "deliver-source",
      offset: 0,
      limit: 2,
      contributions: proposals,
    },
    now: Date.now(),
  });
  assert.equal(delivered.state, "committed");
  const deliveredRows = await query(
    pe.DB,
    "SELECT contribution_id FROM contacts_contributions WHERE source_publication=?",
    [source.publicationId],
  );
  for (const r of deliveredRows)
    assert.equal(
      (
        await processContribution(
          { payload: { contributionId: r.contribution_id } },
          pe,
        )
      ).state,
      "accepted",
    );
  assert.equal(
    (
      await one(
        pe.DB,
        "SELECT basic_name FROM contacts_staff WHERE staff_id='inactive-a'",
      )
    ).basic_name,
    "Contribution Applied",
  );
  const outcomes = await query(
    pe.DB,
    "SELECT field,state FROM contacts_contributions WHERE source_publication=?",
    [source.publicationId],
  );
  assert.equal(outcomes.find((r) => r.field === "basicName").state, "applied");
  assert.equal(
    outcomes.find((r) => r.field === "employmentActive").state,
    "conflicted",
  );
  console.log(
    "PASS independent contribution field application and stale-field conflict with current Core authority; publication proof is synthetic",
  );
  const subjectDefinitions = {
    catalogueId: "subject-tags",
    revision: "1",
    kind: "operational-tag",
    entries: [
      {
        code: "MTL",
        label: "MTL",
        active: true,
        definitionRevision: "mtl-1",
        category: "subjectTags",
        ttbVisible: true,
        order: 0,
      },
    ],
  };
  const roleDefinitions = {
    catalogueId: "roles",
    revision: "1",
    kind: "membership-role",
    entries: [
      {
        code: "MTL",
        label: "Mother Tongue Teacher",
        active: true,
        definitionRevision: "mtl-role-1",
        flags: Object.fromEntries(
          [
            "sl",
            "sc",
            "smc",
            "kp",
            "tl",
            "sdt",
            "cmt",
            "sat",
            "support",
            "mk",
          ].map((k) => [k, false]),
        ),
        eoAppointment: null,
      },
    ],
  };
  await call(pu, "/catalogues", { revision: 0, catalogue: subjectDefinitions });
  await call(pu, "/catalogues", { revision: 0, catalogue: roleDefinitions });
  await call(pu, "/staff/inactive-a/update", {
    changes: { role: { catalogueId: "roles", revision: "1", code: "MTL" } },
    validFrom: future,
  });
  const beforeRole = await contacts({
      env: pe,
      path: "/staff/inactive-a",
      method: "GET",
      principal: manager,
      now: Date.now(),
    }),
    afterRole = await contacts({
      env: pe,
      path: "/staff/inactive-a",
      method: "GET",
      principal: manager,
      now: future + 1,
    });
  assert.deepEqual(beforeRole.fields.subjectTags.value, []);
  assert.equal(afterRole.fields.subjectTags.value[0].code, "MTL");
  assert.equal(afterRole.ttbName, "Contribution Applied (MTL)");
  console.log(
    "PASS future role-implied structured subject tag and display activate only in their accepted interval",
  );
  // Immutable records and durable decision survive process restart.
  await c.restart();
  await p.restart();
  ce.DB = c.db;
  pe.DB = p.db;
  const restored = JSON.parse(
    (
      await one(
        ce.DB,
        "SELECT evidence_json FROM core_evidence WHERE decision_id=?",
        [allowed.decisionId],
      )
    ).evidence_json,
  );
  assert.deepEqual(restored, chain);
  const snapshot = await one(
    pe.DB,
    "SELECT body,digest FROM contacts_snapshots WHERE school_id=? AND snapshot_id=?",
    [base.SCHOOL_ID, chain.contacts.snapshot.snapshotId],
  );
  assert.equal(snapshot.digest, chain.contacts.contentDigest);
  assert.deepEqual(JSON.parse(snapshot.body), chain.contacts.snapshot);
  console.log(
    "PASS CORE03 restart recovers exact historical snapshot and actual observation",
  );
  const cb = await backupOwner({
      db: ce.DB,
      bucket: c.bucket,
      owner: "core",
      schoolId: base.SCHOOL_ID,
      backupId: "core-proof",
      sourceCommit: "synthetic-test",
    }),
    pb = await backupOwner({
      db: pe.DB,
      bucket: p.bucket,
      owner: "contacts",
      schoolId: base.SCHOOL_ID,
      backupId: "contacts-proof",
      sourceCommit: "synthetic-test",
    });
  const restoredCore = await createDatabase("core"),
    restoredContacts = await createDatabase("contacts");
  try {
    await restoreOwner({
      db: restoredCore.db,
      bucket: restoredCore.bucket,
      sourceBucket: c.bucket,
      manifestKey: cb.manifestKey,
      expectedSchoolId: base.SCHOOL_ID,
      expectedOwner: "core",
    });
    await restoreOwner({
      db: restoredContacts.db,
      bucket: restoredContacts.bucket,
      sourceBucket: p.bucket,
      manifestKey: pb.manifestKey,
      expectedSchoolId: base.SCHOOL_ID,
      expectedOwner: "contacts",
    });
    const recovered = JSON.parse(
      (
        await one(
          restoredCore.db,
          "SELECT evidence_json FROM core_evidence WHERE decision_id=?",
          [allowed.decisionId],
        )
      ).evidence_json,
    );
    const exact = await one(
      restoredContacts.db,
      "SELECT body,digest FROM contacts_snapshots WHERE school_id=? AND snapshot_id=?",
      [base.SCHOOL_ID, recovered.contacts.snapshot.snapshotId],
    );
    assert.equal(exact.digest, recovered.contacts.contentDigest);
    assert.deepEqual(JSON.parse(exact.body), chain.contacts.snapshot);
    assert.deepEqual(
      recovered.contacts.observation,
      chain.contacts.observation,
    );
    assert.deepEqual(
      recovered.contacts.eligibility,
      chain.contacts.eligibility,
    );
    const links = await query(
      restoredCore.db,
      "SELECT * FROM core_destination_receipts",
    );
    assert(links.length >= 5);
    assert(
      links.every((l) =>
        ["committed", "terminal-not-committed"].includes(
          JSON.parse(l.receipt_json).state,
        ),
      ),
    );
  } finally {
    await restoredCore.close();
    await restoredContacts.close();
  }
  const corrupt = await createDatabase("core");
  try {
    await c.bucket.put(cb.manifest.data.key, "corrupted");
    await assert.rejects(
      () =>
        restoreOwner({
          db: corrupt.db,
          bucket: corrupt.bucket,
          sourceBucket: c.bucket,
          manifestKey: cb.manifestKey,
          expectedSchoolId: base.SCHOOL_ID,
          expectedOwner: "core",
        }),
      (e) => e.code === "BACKUP_INTEGRITY_FAILED",
    );
    assert.equal(
      (await one(corrupt.db, "SELECT COUNT(*) n FROM core_evidence")).n,
      0,
    );
  } finally {
    await corrupt.close();
  }
  console.log(
    "PASS CORE03/F5 verified separate owner backups restore exact evidence, immutable content and committed receipts; corrupt part rejects",
  );
  const partialBody = {
    operationId: "partial-admission",
    changes: { preferredName: "Synthetic pending" },
  };
  const pp = await authorize(pu, "contacts", "contacts.manage", partialBody);
  const partialOp = await prepareOperation(pe.DB, {
    schoolId: base.SCHOOL_ID,
    actorId: pp.actorId,
    operationId: partialBody.operationId,
    action: "contacts.manage",
    intent: partialBody,
    now: Date.now(),
    validUntil: pp.validUntil,
    authorization: pp,
  });
  const teacherRevision = (
    await one(pe.DB, "SELECT revision FROM contacts_staff WHERE staff_id=?", [
      "teacher-a",
    ])
  ).revision;
  const partial = await admit(
    pe,
    pe.DB,
    partialOp,
    pp,
    [
      {
        owner: "contacts",
        scope: "staff:teacher-a",
        revision: String(teacherRevision),
        validUntil: null,
      },
    ],
    Date.now(),
  );
  assert.equal(partial.pins.length, 2);
  await statement(
    pe.DB,
    "UPDATE product_admissions SET state='acquiring' WHERE school_id=? AND operation_id=?",
    [base.SCHOOL_ID, partialBody.operationId],
  ).run();
  await p.restart();
  pe.DB = p.db;
  const retryPrincipal = await authorize(
    pu,
    "contacts",
    "contacts.manage",
    partialBody,
  );
  await assert.rejects(
    () =>
      admit(
        pe,
        pe.DB,
        partialOp,
        retryPrincipal,
        [
          {
            owner: "contacts",
            scope: "staff:teacher-a",
            revision: String(teacherRevision),
            validUntil: null,
          },
        ],
        Date.now(),
      ),
    (e) => e.code === "OPERATION_ABORTED",
  );
  assert.equal(
    (await operationStatus(pe.DB, base.SCHOOL_ID, partialBody.operationId))
      .state,
    "aborted",
  );
  const retained = JSON.parse(
    (
      await one(
        pe.DB,
        "SELECT pins_json FROM product_admissions WHERE operation_id=?",
        [partialBody.operationId],
      )
    ).pins_json,
  );
  assert.equal(retained.length, 2);
  assert.equal(
    (
      await one(
        ce.DB,
        "SELECT COUNT(*) n FROM source_pins WHERE operation_id=? AND state='held'",
        [partialBody.operationId],
      )
    ).n,
    0,
  );
  assert.equal(
    (
      await one(
        pe.DB,
        "SELECT COUNT(*) n FROM source_pins WHERE operation_id=? AND state='held'",
        [partialBody.operationId],
      )
    ).n,
    0,
  );
  console.log(
    "PASS interrupted second-pin acquisition survives restart, fences destination and retains/resolves every original pin identity",
  );

  // Cross-owner ordering: outstanding destination pin blocks source change; durable abort releases it.
  const intent = {
    operationId: "held-operation",
    staffId: "teacher-a",
    changes: { preferredName: "Synthetic preferred" },
  };
  const principal = await authorize(
    admin,
    "contacts",
    "contacts.manage",
    intent,
  );
  const op = await prepareOperation(pe.DB, {
    schoolId: base.SCHOOL_ID,
    actorId: principal.actorId,
    operationId: intent.operationId,
    action: "contacts.manage",
    intent,
    now: Date.now(),
    validUntil: principal.validUntil,
    authorization: principal,
  });
  const admission = await admit(pe, pe.DB, op, principal, [], Date.now());
  assert.equal(admission.pins.length, 1);
  const suspendBody = {
    operationId: "held-operation",
    accountId: "admin-a",
    revision: 1,
    suspended: true,
  };
  const suspender = await authorize(self, "core", "core.admin", suspendBody);
  const pending = await core({
    env: ce,
    path: "/admin/accounts",
    method: "POST",
    body: suspendBody,
    principal: suspender,
    request: new Request(base.PUBLIC_ORIGIN),
    now: Date.now(),
  });
  assert.equal(pending.state, "pending");
  const { sourceChangeGuard, queueSourceChange } = await import(
    "../v1/runtime/admission.mjs"
  );
  const guard = sourceChangeGuard(
    base.SCHOOL_ID,
    "account:admin-a",
    "held-operation",
    "core",
  );
  assert.equal((await one(ce.DB, guard.sql, guard.args)).ok, 0);
  assert.equal(
    (
      await queueSourceChange(
        ce.DB,
        base.SCHOOL_ID,
        "account:admin-a",
        "held-operation",
        Date.now(),
        "core",
      )
    ).length,
    1,
  );
  assert.equal(
    (
      await one(
        ce.DB,
        "SELECT suspended FROM core_accounts WHERE account_id=?",
        ["admin-a"],
      )
    ).suspended,
    0,
  );
  const { abortOperation } = await import("../v1/runtime/store.mjs");
  await abortOperation(pe.DB, op, "TEST_CANCEL", Date.now());
  await resolveAdmission(pe, pe.DB, op, admission, null, Date.now());
  assert.equal(
    (
      await one(
        ce.DB,
        "SELECT COUNT(*) n FROM source_pins WHERE operation_id=? AND state='held'",
        [op.operationId],
      )
    ).n,
    0,
  );
  console.log(
    "PASS CORE02 cross-domain equal operation IDs cannot bypass held pins; source change waits for durable destination fence",
  );
  await assert.rejects(
    () =>
      authorizeRosterSchedule(
        ce,
        {
          schoolId: base.SCHOOL_ID,
          action: "roster.allocate",
          operationId: "scheduled-a",
          bodyDigest: "a".repeat(64),
        },
        Date.now(),
      ),
    (e) => e.code === "SERVICE_GRANT_REQUIRED",
  );
  console.log(
    "PASS scheduler requires explicit enrolled service grant; no implicit Admin",
  );
} finally {
  await c.close();
  await p.close();
}
