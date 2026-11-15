import assert from "node:assert/strict";
import VenueGroups from "../shared/venue-groups.js";
import { handle, policy, loadVersion } from "../v1/services/deploy/service.mjs";
import { authorize } from "../v1/runtime/security.mjs";
import { digest } from "../v1/runtime/store.mjs";
import { productSuite } from "./v1-product/suite.mjs";

// Real local Workers, Core decisions and owning D1 transactions. All records
// are synthetic; this is neither hosted UAT nor a live operation.
const suite = await productSuite();
const school = "synthetic-school";
const failures = [];
let passed = 0;
async function test(name, run) {
  try {
    await run();
    passed++;
    console.log("PASS " + name);
  } catch (error) {
    failures.push({ name, error });
    console.error("FAIL " + name + ": " + error.stack);
  }
}
try {
  const admin = await suite.seedAccount("clear-admin");
  const editor = await suite.seedAccount("clear-editor", {
    staffId: "clear-teacher",
    capabilities: [],
  });
  await suite.call(admin, "contacts", "/staff/create", {
    operationId: "clear-staff-create",
    staffId: editor.staffId,
    basicName: "Synthetic Planning Teacher",
  });
  await suite.call(admin, "contacts", `/staff/${editor.staffId}/update`, {
    operationId: "clear-staff-active",
    changes: { employmentActive: true },
    fieldRevisions: { employmentActive: 0 },
  });
  for (const [field, value] of [
    ["smc", true],
    ["eo", true],
    ["schoolLeader", false],
  ]) {
    await suite.call(admin, "contacts", `/staff/${editor.staffId}/accept`, {
      operationId: "clear-accept-" + field,
      field,
      value,
      revision: 0,
      ownerReviewReference: "synthetic-owner-review",
    });
  }
  const db = await suite.db("deploy");
  const venues = await suite.db("venues");
  await venues
    .prepare(
      "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,'venues','clear-room',7,?)",
    )
    .bind(
      school,
      JSON.stringify({
        id: "clear-room",
        name: "Synthetic room",
        unit: "A-01",
        shortName: "A",
      }),
    )
    .run();
  let serial = 0;
  async function plan() {
    const { versionId } = await suite.call(
      admin,
      "deploy",
      "/versions/create",
      {
        operationId: "clear-plan-" + ++serial,
        name: "Synthetic clear plan " + serial,
        year: 2026,
      },
    );
    const rows = [
      [
        "classes",
        "clear-class",
        {
          ref: "clear-class",
          level: "1",
          name: "Alpha",
          shortName: "A",
          venueId: "clear-room",
        },
      ],
      [
        "venues",
        "clear-room",
        {
          id: "clear-room",
          name: "Synthetic room",
          unit: "A-01",
          shortName: "A",
          revision: 7,
          form: "1A",
          forms: ["1A"],
        },
      ],
      [
        "groups",
        "clear-group",
        {
          id: "clear-group",
          name: "Synthetic TG",
          subject: "Music",
          level: "1",
          levels: ["1"],
          classRefs: ["clear-class"],
          weeklyPeriods: 1,
          venue: "clear-room",
        },
      ],
      [
        "assignments",
        "clear-assignment",
        {
          id: "clear-assignment",
          teacher: editor.staffId,
          target: "clear-group",
          subject: "Music",
          level: "1",
          venue: "clear-room",
        },
      ],
    ];
    await db.batch(
      rows.map(([scope, rowId, value]) =>
        db
          .prepare(
            "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,?,?,1,?)",
          )
          .bind(school, versionId, scope, rowId, JSON.stringify(value)),
      ),
    );
    return versionId;
  }
  const saved = async (versionId) => ({
    version: await db
      .prepare("SELECT * FROM deploy_versions WHERE school_id=? AND id=?")
      .bind(school, versionId)
      .first(),
    rows: (
      await db
        .prepare(
          "SELECT * FROM deploy_rows WHERE school_id=? AND version_id=? ORDER BY scope,row_id",
        )
        .bind(school, versionId)
        .all()
    ).results,
  });
  const snapshot = async (versionId) =>
    (await suite.call(admin, "deploy", "/bootstrap", { versionId })).current;
  async function input(
    user,
    versionId,
    operationId,
    { direct = false, mixed = false, scope = "meta" } = {},
  ) {
    const doc = await snapshot(versionId);
    const grant = await suite.call(user, "deploy", "/lease", {
      operationId: operationId + "-lease",
      versionId,
      scope,
      clientId: "clear-test",
    });
    const clear = {
      operation: "clearVenueAssignments",
      expected: VenueGroups.clearState(doc),
    };
    return {
      operationId,
      versionId,
      revision: doc.revision,
      scope,
      clientId: "clear-test",
      leaseFence: grant.fence,
      ...(direct
        ? clear
        : {
            operation: "saveDraft",
            edits: [
              ...(mixed
                ? [
                    {
                      operation: "setTeacherNote",
                      teacher: editor.staffId,
                      value: "Must not partially save",
                      expected: "",
                    },
                  ]
                : []),
              clear,
            ],
          }),
    };
  }
  const send = (user, body, headers = {}) =>
    suite.request(user, "deploy", "/change", { method: "POST", body, headers });
  for (const direct of [true, false])
    await test(
      "non-Admin " +
        (direct ? "direct" : "mixed-batch") +
        " clear is denied without partial writes",
      async () => {
        const versionId = await plan();
        const body = await input(editor, versionId, "editor-clear-" + direct, {
          direct,
          mixed: !direct,
        });
        const before = await saved(versionId);
        const response = await send(editor, body);
        assert.equal(response.status, 403, JSON.stringify(response.body));
        assert.equal(response.body.error.code, "CAPABILITY_DENIED");
        assert.deepEqual(await saved(versionId), before);
        const receipt = await suite.call(admin, "deploy", "/receipt", {
          operationId: body.operationId,
        });
        assert.equal(receipt.saved, false);
      },
    );
  await test("ordinary non-Admin edits remain permitted", async () => {
    const versionId = await plan();
    const body = await input(editor, versionId, "editor-note-only");
    body.edits = [
      {
        operation: "setTeacherNote",
        teacher: editor.staffId,
        value: "Allowed planning note",
        expected: "",
      },
    ];
    const result = await send(editor, body);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(
      (await snapshot(versionId)).teacherNotes[editor.staffId],
      "Allowed planning note",
    );
  });
  async function publish(versionId, operationId) {
    const doc = await snapshot(versionId);
    const grant = await suite.call(admin, "deploy", "/lease", {
      operationId: operationId + "-lease",
      versionId,
      scope: "meta",
      clientId: "clear-test",
    });
    const pointer = await db
      .prepare("SELECT sequence FROM deploy_pointer WHERE school_id=?")
      .bind(school)
      .first();
    const body = {
      operationId,
      versionId,
      revision: doc.revision,
      scope: "meta",
      clientId: "clear-test",
      leaseFence: grant.fence,
      expectedPointerSequence: pointer?.sequence || 0,
    };
    return {
      body,
      result: await suite.call(admin, "deploy", "/publish", body),
    };
  }
  await test("Admin clear preserves identities and committed replay after publication", async () => {
    const versionId = await plan(),
      before = await snapshot(versionId);
    const body = await input(admin, versionId, "admin-clear");
    const first = await send(admin, body);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const after = await snapshot(versionId);
    for (const [key, id] of [
      ["venues", "id"],
      ["classes", "ref"],
      ["groups", "id"],
      ["assignments", "id"],
      ["teachers", "id"],
    ]) {
      assert.deepEqual(
        after[key].map((row) => row[id]),
        before[key].map((row) => row[id]),
        key + " identities",
      );
    }
    assert(after.classes.every((row) => !row.venueId));
    assert(after.venues.every((row) => !row.form && !row.forms?.length));
    assert(after.groups.every((row) => !row.venue));
    assert(after.assignments.every((row) => !row.venue));
    assert.deepEqual(
      after.assignments.map(({ venue, ...row }) => row),
      before.assignments.map(({ venue, ...row }) => row),
    );
    await publish(versionId, "publish-after-clear");
    const persisted = await saved(versionId);
    const replay = await send(admin, body);
    assert.deepEqual(replay.body, first.body);
    assert.deepEqual(await saved(versionId), persisted);
    const altered = await send(admin, {
      ...body,
      edits: [{ ...body.edits[0], expected: {} }],
    });
    assert.equal(altered.status, 409);
    assert.equal(altered.body.error.code, "OPERATION_INTENT_CONFLICT");
  });
  await test("current and previously published versions reject new clears", async () => {
    const versionId = await plan();
    await publish(versionId, "publish-protected-current");
    for (const prior of [false, true]) {
      if (prior) await publish(await plan(), "publish-replacement-current");
      const body = await input(admin, versionId, "clear-published-" + prior),
        before = await saved(versionId);
      const result = await send(admin, body);
      assert.equal(result.status, 409, JSON.stringify(result.body));
      assert.equal(result.body.error.code, "VENUE_CLEAR_NOT_ALLOWED");
      assert.deepEqual(await saved(versionId), before);
      assert.equal(
        (
          await suite.call(admin, "deploy", "/receipt", {
            operationId: body.operationId,
          })
        ).saved,
        false,
      );
    }
  });
  async function seedPreparation(
    versionId,
    operationId,
    state = "prepared",
    ownerSchool = school,
  ) {
    const doc = (await loadVersion(db, school, versionId)).doc;
    if (state !== "missing")
      await db
        .prepare(
          "INSERT INTO product_operations(school_id,operation_id,actor_id,action,digest,state,created_at,valid_until,updated_at) VALUES(?,?,?,'deploy.publish',?,?,?, ?,?)",
        )
        .bind(
          ownerSchool,
          operationId,
          admin.id,
          "synthetic-digest-" + operationId,
          state,
          Date.now(),
          Date.now() + 60000,
          Date.now(),
        )
        .run();
    await db
      .prepare(
        "INSERT INTO deploy_prepared_publications(school_id,operation_id,fence,payload_digest,payload_key,envelope,document,dependencies,contacts_evidence,publication_id,sequence,created_at) VALUES(?,?,1,?,'synthetic-key','{}',?,'[]','{}',?,100,?)",
      )
      .bind(
        ownerSchool,
        operationId,
        "synthetic-digest-" + operationId,
        JSON.stringify(doc),
        "synthetic-pub-" + operationId,
        Date.now(),
      )
      .run();
  }
  await test("live and orphaned preparations block but terminal abort does not", async () => {
    for (const state of ["prepared", "missing", "aborted"]) {
      const versionId = await plan();
      await seedPreparation(versionId, "pending-pub-" + state, state);
      const body = await input(admin, versionId, "clear-with-prep-" + state),
        before = await saved(versionId);
      const result = await send(admin, body);
      assert.equal(
        result.status,
        state === "aborted" ? 200 : 409,
        JSON.stringify(result.body),
      );
      if (state !== "aborted") {
        assert.equal(result.body.error.code, "VENUE_CLEAR_NOT_ALLOWED");
        assert.deepEqual(await saved(versionId), before);
      }
    }
  });
  await test("preparation guards are scoped to the exact school and version", async () => {
    const versionId = await plan(),
      other = await plan();
    await seedPreparation(other, "other-version-pub");
    await seedPreparation(
      versionId,
      "other-school-pub",
      "prepared",
      "other-school",
    );
    const body = await input(admin, versionId, "clear-scoped-preps");
    assert.equal((await send(admin, body)).status, 200);
  });
  await test("preview, foreign school, and revoked capabilities cannot clear", async () => {
    const preview = await suite.seedAccount("clear-preview-admin");
    const revoked = await suite.seedAccount("clear-revoked-admin", {
      staffId: editor.staffId,
    });
    const cases = [
      {
        name: "preview",
        user: admin,
        headers: { "x-gsis-preview-account": preview.id },
      },
      { name: "foreign-school", user: admin, schoolId: "other-school" },
      { name: "revoked", user: revoked },
    ];
    for (const row of cases) {
      const versionId = await plan();
      const body = await input(row.user, versionId, "clear-denied-" + row.name);
      if (row.schoolId) body.schoolId = row.schoolId;
      if (row.name === "revoked") {
        const core = await suite.db("core");
        await core
          .prepare("DELETE FROM core_grants WHERE school_id=? AND account_id=?")
          .bind(school, revoked.id)
          .run();
      }
      const before = await saved(versionId);
      const result = await send(row.user, body, row.headers);
      assert.equal(result.status, 403, JSON.stringify(result.body));
      assert.deepEqual(await saved(versionId), before);
    }
  });
  await test("stale clear previews and saved revisions remain conflicts", async () => {
    for (const stale of ["preview", "revision"]) {
      const versionId = await plan(),
        body = await input(admin, versionId, "clear-stale-" + stale),
        before = await saved(versionId);
      if (stale === "preview") body.edits[0].expected = {};
      else body.revision++;
      const result = await send(admin, body);
      assert.equal(result.status, 409, JSON.stringify(result.body));
      assert.equal(result.body.error.code, "REVISION_CONFLICT");
      assert.deepEqual(await saved(versionId), before);
    }
  });

  // Deterministic interleavings wrap only local D1/R2 scheduling. The domain
  // handler, Core authorization/pins, publication and D1 batches remain real.
  async function binding(name) {
    const worker = await suite.mf.getWorker(name);
    return {
      fetch: async (request) =>
        worker.fetch(request.url, {
          method: request.method,
          headers: Object.fromEntries(request.headers),
          body: await request.text(),
        }),
    };
  }
  const coreBinding = await binding("gsis-core");
  const contactsBinding = await binding("gsis-contacts");
  const venuesBinding = await binding("gsis-venues");
  const bucket = await suite.mf.getR2Bucket("ARTIFACTS", "gsis-deploy");
  function barrier() {
    let reached, release;
    const ready = new Promise((resolve) => {
      reached = resolve;
    });
    const held = new Promise((resolve) => {
      release = resolve;
    });
    return {
      ready,
      release,
      async stop() {
        reached();
        await held;
      },
    };
  }
  async function waitForGate(gate, operation) {
    let timer;
    try {
      await Promise.race([
        gate.ready,
        operation.then((result) => {
          throw (
            result.error || Error("Operation completed before race barrier")
          );
        }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("Race barrier was not reached")),
            10000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function direct(
    path,
    body,
    { database = db, artifacts = bucket } = {},
  ) {
    const env = {
      SCHOOL_ID: school,
      SERVICE_NAME: "deploy",
      GSIS_SECRET: suite.secret,
      DB: database,
      ARTIFACTS: artifacts,
      CORE: coreBinding,
      CONTACTS: contactsBinding,
      VENUES: venuesBinding,
    };
    const now = Date.now(),
      request = new Request("https://gsis.example.invalid" + path, {
        method: "POST",
        headers: {
          origin: "https://gsis.example.invalid",
          cookie: "__Host-gsis_session=" + admin.token,
          "x-csrf-token": admin.csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const bound = { ...body };
    delete bound.requestId;
    const principal = await authorize(
      env,
      request,
      {
        ...policy("POST", path, body),
        service: "deploy",
        operationId: body.operationId,
        bodyDigest: await digest(bound),
      },
      now,
    );
    return handle({
      env,
      body,
      path,
      method: "POST",
      now,
      request,
      principal,
      requestId: crypto.randomUUID(),
    });
  }
  async function publishingBody(versionId, operationId) {
    const doc = await snapshot(versionId),
      grant = await suite.call(admin, "deploy", "/lease", {
        operationId: operationId + "-lease",
        versionId,
        scope: "meta",
        clientId: "clear-test",
      });
    const pointer = await db
      .prepare("SELECT sequence FROM deploy_pointer WHERE school_id=?")
      .bind(school)
      .first();
    return {
      operationId,
      versionId,
      revision: doc.revision,
      scope: "meta",
      clientId: "clear-test",
      leaseFence: grant.fence,
      expectedPointerSequence: pointer?.sequence || 0,
    };
  }
  await test("publication wins after clear precheck but before its atomic batch", async () => {
    const versionId = await plan(),
      body = await input(admin, versionId, "clear-race-publication-wins", {
        scope: "clear-race",
      }),
      before = await saved(versionId);
    delete body.revision; // Owner-side protection must not depend on supplied revision.
    const gate = barrier();
    const database = {
      prepare: (sql) => db.prepare(sql),
      batch: async (statements) => {
        if (
          statements.some(
            (s) =>
              s.sql.includes("INSERT INTO product_audit") &&
              s.args.includes(body.operationId),
          )
        )
          await gate.stop();
        return db.batch(statements);
      },
    };
    const clearing = direct("/change", body, { database }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    try {
      await waitForGate(gate, clearing);
      await publish(versionId, "publication-wins-race");
    } finally {
      gate.release();
    }
    const outcome = await clearing;
    assert.equal(
      outcome.error?.code,
      "REVISION_CONFLICT",
      JSON.stringify(outcome.value),
    );
    assert.deepEqual(await saved(versionId), before);
    const receipt = await suite.call(admin, "deploy", "/receipt", {
      operationId: body.operationId,
    });
    assert.equal(receipt.receipt.state, "terminal-not-committed");
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM deploy_publications WHERE school_id=? AND version_id=?",
          )
          .bind(school, versionId)
          .first()
      ).n,
      1,
    );
  });
  await test("a real prepared publication arriving during clear fences that clear", async () => {
    const versionId = await plan(),
      body = await input(admin, versionId, "clear-race-prepared-wins", {
        scope: "clear-race",
      }),
      before = await saved(versionId);
    const clearGate = barrier(),
      publishGate = barrier();
    const database = {
      prepare: (sql) => db.prepare(sql),
      batch: async (statements) => {
        if (
          statements.some(
            (s) =>
              s.sql.includes("INSERT INTO product_audit") &&
              s.args.includes(body.operationId),
          )
        )
          await clearGate.stop();
        return db.batch(statements);
      },
    };
    const clearing = direct("/change", body, { database }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    let publication;
    try {
      await waitForGate(clearGate, clearing);
      const pubBody = await publishingBody(
        versionId,
        "publication-prepared-race",
      );
      const pubDatabase = {
        prepare: (sql) => db.prepare(sql),
        batch: async (statements) => {
          if (
            statements.some(
              (s) =>
                s.sql.includes("INSERT INTO product_audit") &&
                s.args.includes(pubBody.operationId),
            )
          )
            await publishGate.stop();
          return db.batch(statements);
        },
      };
      publication = direct("/publish", pubBody, { database: pubDatabase }).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await waitForGate(publishGate, publication);
      assert(
        await db
          .prepare(
            "SELECT operation_id FROM deploy_prepared_publications WHERE operation_id=?",
          )
          .bind(pubBody.operationId)
          .first(),
      );
      clearGate.release();
      const outcome = await clearing;
      assert.equal(
        outcome.error?.code,
        "REVISION_CONFLICT",
        JSON.stringify(outcome.value),
      );
      assert.deepEqual(await saved(versionId), before);
    } finally {
      clearGate.release();
      publishGate.release();
    }
    const outcome = await publication;
    assert.equal(outcome.value?.state, "committed", outcome.error?.stack);
  });
  await test("clear wins during publication calculation and invalidates its saved revision", async () => {
    const versionId = await plan(),
      pubBody = await publishingBody(versionId, "publication-loses-race"),
      gate = barrier();
    const artifacts = {
      get: (key) => bucket.get(key),
      put: async (...args) => {
        await gate.stop();
        return bucket.put(...args);
      },
    };
    const publication = direct("/publish", pubBody, { artifacts }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    try {
      await waitForGate(gate, publication);
      const body = await input(admin, versionId, "clear-wins-race", {
        scope: "clear-race",
      });
      delete body.revision;
      const response = await send(admin, body);
      assert.equal(response.status, 200, JSON.stringify(response.body));
    } finally {
      gate.release();
    }
    const outcome = await publication;
    assert.equal(
      outcome.error?.code,
      "REVISION_CONFLICT",
      JSON.stringify(outcome.value),
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM deploy_publications WHERE school_id=? AND version_id=?",
          )
          .bind(school, versionId)
          .first()
      ).n,
      0,
    );
    assert.equal((await snapshot(versionId)).revision, 1);
    const receipt = await suite.call(admin, "deploy", "/receipt", {
      operationId: pubBody.operationId,
    });
    assert.equal(receipt.receipt.state, "terminal-not-committed");
  });
} finally {
  await suite.close();
}
console.log(
  `${passed} Deploy clear authority groups passed; ${failures.length} failed.`,
);
if (failures.length) process.exitCode = 1;
