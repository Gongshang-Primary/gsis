import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { handle, policy } from "../v1/services/deploy/service.mjs";
import { authorize } from "../v1/runtime/security.mjs";
import {
  digest,
  operationStatus,
  prepareOperation,
} from "../v1/runtime/store.mjs";

// Actual local Workers, Core decisions and owning D1 transactions. Boundary
// failures and scheduling delays are synthetic; no hosted/runtime UAT claim.
const suite = await productSuite();
let runtime = suite,
  restarted = false,
  db = await suite.db("deploy"),
  core = await suite.db("core");
const school = "synthetic-school",
  failures = [];
let passed = 0,
  serial = 0;
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
const next = (prefix) => prefix + "-" + ++serial;
async function request(
  user,
  path,
  body,
  { method = "POST", headers = {} } = {},
) {
  const response = await runtime.mf.dispatchFetch(
    origin + "/api/deploy" + path,
    {
      method,
      headers: {
        origin,
        cookie: "__Host-gsis_session=" + user.token,
        "x-csrf-token": user.csrf,
        "content-type": "application/json",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  return { status: response.status, body: await response.json() };
}
async function call(user, path, body, options) {
  const response = await request(user, path, body, options);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}
async function binding(name) {
  const worker = await runtime.mf.getWorker("gsis-" + name);
  return {
    fetch: async (request) =>
      worker.fetch(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: await request.text(),
      }),
  };
}
async function context(
  user,
  path,
  body,
  { database = db, coreOverride, contactsOverride } = {},
) {
  const env = {
    SCHOOL_ID: school,
    SERVICE_NAME: "deploy",
    GSIS_SECRET: suite.secret,
    DB: database,
    ARTIFACTS: await runtime.mf.getR2Bucket("ARTIFACTS", "gsis-deploy"),
    CORE: await binding("core"),
    CONTACTS: await binding("contacts"),
    VENUES: await binding("venues"),
  };
  const now = Date.now(),
    request = new Request(origin + path, {
      method: "POST",
      headers: {
        origin,
        cookie: "__Host-gsis_session=" + user.token,
        "x-csrf-token": user.csrf,
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
  // Fault injection follows real current authorization; only the subsequent
  // owning-service boundary or actual D1 scheduling is replaced.
  if (coreOverride) env.CORE = coreOverride(env.CORE);
  if (contactsOverride) env.CONTACTS = contactsOverride(env.CONTACTS);
  return {
    env,
    body,
    path,
    method: "POST",
    now,
    request,
    principal,
    requestId: crypto.randomUUID(),
  };
}
async function direct(user, path, body, options) {
  return handle(await context(user, path, body, options));
}
async function snapshot(versionId) {
  return db
    .prepare("SELECT * FROM deploy_versions WHERE school_id=? AND id=?")
    .bind(school, versionId)
    .first();
}
async function rawOperation(operationId) {
  return db
    .prepare(
      "SELECT * FROM product_operations WHERE school_id=? AND operation_id=?",
    )
    .bind(school, operationId)
    .first();
}
async function note(user, prefix = "note") {
  const { versionId } = await call(user, "/versions/create", {
    operationId: next(prefix + "-create"),
    name: "Synthetic recovery " + serial,
    year: 2026,
  });
  const grant = await call(user, "/lease", {
    operationId: next(prefix + "-lease"),
    versionId,
    scope: "meta",
    clientId: "recovery-client",
  });
  return {
    operationId: next(prefix + "-save"),
    operation: "saveVersionNote",
    versionId,
    revision: 0,
    scope: "meta",
    clientId: "recovery-client",
    leaseFence: grant.fence,
    notes: "Synthetic note " + serial,
    expected: "",
  };
}
async function prepared(user, body, path = "/change") {
  const ctx = await context(user, path, body),
    intent = structuredClone(body);
  for (const field of [
    "requestId",
    "operationId",
    "protocol",
    "authority",
    "auditPaged",
    "reliefResults",
    "returnDelta",
    "since",
    "knownCatalogueHash",
  ])
    delete intent[field];
  return prepareOperation(db, {
    schoolId: school,
    actorId: user.id,
    operationId: body.operationId,
    action: ctx.principal.action,
    intent,
    now: ctx.now,
    validUntil: ctx.principal.validUntil,
    authorization: ctx.principal,
  });
}
const recovery = (body) => ({
  operationId: body.operationId,
  versionId: body.versionId,
  recovery: true,
});
const withdrawal = (body, op, changes = {}) => ({
  operationId: next("withdraw"),
  targetOperationId: op.operationId,
  versionId: body.versionId,
  expectedDigest: op.digest,
  expectedRequestDigest: op.requestDigest,
  expectedFence: op.fence,
  ...changes,
});
function verify(value, body, op, state) {
  assert.equal(value.bindingVerified, true);
  for (const [key, expected] of Object.entries({
    service: "deploy",
    schoolId: school,
    actorId: op.actorId,
    action: "deploy.edit",
    versionId: body.versionId,
    operationId: op.operationId,
    digest: op.digest,
    requestDigest: op.requestDigest,
    state,
  }))
    assert.equal(value[key], expected, key);
  assert.equal(value.originalFence, op.fence);
  assert.equal(value.currentFence, op.fence + (state === "aborted" ? 1 : 0));
  assert.equal(value.saved, state === "committed");
}
function barrier() {
  let reached, release;
  const ready = new Promise((resolve) => {
      reached = resolve;
    }),
    held = new Promise((resolve) => {
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
      operation.then((out) => {
        throw out.error || Error("Operation completed before race barrier");
      }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Race barrier not reached")),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const settled = (promise) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
const commitBatch = (statements, id) =>
  statements.some(
    (s) => s.sql.includes("INSERT INTO product_audit") && s.args[2] === id,
  );
const abortBatch = (statements, id) =>
  statements.some(
    (s) =>
      s.sql.includes("SET state='aborted',fence=fence+1") &&
      s.args.includes(id),
  );
function databaseHook(run) {
  return {
    prepare: (sql) => db.prepare(sql),
    batch: (statements) => run(statements),
  };
}
async function assertResolution(op, state) {
  const admission = await db
    .prepare(
      "SELECT state FROM product_admissions WHERE school_id=? AND operation_id=?",
    )
    .bind(school, op.operationId)
    .first();
  assert.equal(admission?.state, state);
  const pins = await core
    .prepare(
      "SELECT state FROM source_pins WHERE school_id=? AND destination='deploy' AND operation_id=?",
    )
    .bind(school, op.operationId)
    .all();
  assert(pins.results.length > 0, "actual Core source pin must exist");
  assert(
    pins.results.every(
      (p) => p.state === (state === "resolved" ? "released" : "held"),
    ),
  );
  if (state === "resolved") {
    const linked = await core
      .prepare(
        "SELECT receipt_json FROM core_destination_receipts WHERE school_id=? AND decision_id=? AND destination='deploy' AND operation_id=?",
      )
      .bind(school, op.decisionId, op.operationId)
      .first();
    assert.deepEqual(
      JSON.parse(linked.receipt_json),
      (await operationStatus(db, school, op.operationId)).receipt,
    );
  }
}
try {
  const admin = await suite.seedAccount("recovery-admin"),
    otherAdmin = await suite.seedAccount("recovery-other-admin");
  let committedBody,
    committedOp,
    abortedBody,
    abortedOp,
    restartBody,
    restartOp,
    restartWithdraw;
  await test("lost ordinary save acknowledgement recovers the exact binding without another write", async () => {
    committedBody = await note(admin, "committed");
    // Discard the successful acknowledgement, then recover from durable state.
    await call(admin, "/change", committedBody);
    committedOp = await operationStatus(db, school, committedBody.operationId);
    const saved = await snapshot(committedBody.versionId),
      out = await call(admin, "/receipt", recovery(committedBody));
    verify(out, committedBody, committedOp, "committed");
    assert.deepEqual(out.receipt, committedOp.receipt);
    assert.notEqual(
      out.digest,
      out.requestDigest,
      "business intent and complete wire have distinct hashes",
    );
    await call(admin, "/change", committedBody);
    assert.deepEqual(await snapshot(committedBody.versionId), saved);
    const control = withdrawal(committedBody, committedOp),
      withdrawn = await call(admin, "/operations/withdraw", control);
    verify(withdrawn, committedBody, committedOp, "committed");
    assert.deepEqual(withdrawn.receipt, committedOp.receipt);
    assert.equal(
      await rawOperation(control.operationId),
      null,
      "control request must not create a business operation",
    );
  });
  await test("prepared withdrawal fences once and repeated terminal lookup accepts the original fence", async () => {
    abortedBody = await note(admin, "prepared");
    abortedOp = await prepared(admin, abortedBody);
    const before = await snapshot(abortedBody.versionId),
      pending = await call(admin, "/receipt", recovery(abortedBody));
    verify(pending, abortedBody, abortedOp, "prepared");
    assert.equal(pending.receipt, null);
    const control = withdrawal(abortedBody, abortedOp),
      out = await call(admin, "/operations/withdraw", control);
    verify(out, abortedBody, abortedOp, "aborted");
    assert.equal(out.receipt.state, "terminal-not-committed");
    const repeated = await call(admin, "/operations/withdraw", control);
    assert.deepEqual(repeated.receipt, out.receipt);
    verify(repeated, abortedBody, abortedOp, "aborted");
    verify(
      await call(admin, "/receipt", recovery(abortedBody)),
      abortedBody,
      abortedOp,
      "aborted",
    );
    assert.equal((await request(admin, "/change", abortedBody)).status, 409);
    assert.deepEqual(await snapshot(abortedBody.versionId), before);
    assert.equal(await rawOperation(control.operationId), null);
  });
  await test("missing and foreign-school operation identities stay unknown without target writes", async () => {
    const absent = {
      operationId: next("absent"),
      versionId: committedBody.versionId,
    };
    const out = await call(admin, "/receipt", recovery(absent));
    assert.equal(out.state, "unknown");
    assert.notEqual(out.bindingVerified, true);
    const response = await request(
      admin,
      "/operations/withdraw",
      withdrawal(absent, {
        operationId: absent.operationId,
        digest: committedOp.digest,
        requestDigest: committedOp.requestDigest,
        fence: 1,
      }),
    );
    if (response.status === 200) {
      assert.equal(response.body.data.state, "unknown");
      assert.notEqual(response.body.data.bindingVerified, true);
    } else assert(response.status >= 400);
    assert.equal(await rawOperation(absent.operationId), null);
    const foreign = next("foreign");
    await db
      .prepare(
        "INSERT INTO product_operations(school_id,operation_id,actor_id,action,digest,fence,state,created_at,valid_until,updated_at,request_digest,authority_action,decision_id) VALUES('another-school',?,?, 'deploy.edit',?,1,'prepared',?,?,?,?,'deploy.edit',?)",
      )
      .bind(
        foreign,
        admin.id,
        committedOp.digest,
        Date.now(),
        Date.now() + 60000,
        Date.now(),
        committedOp.requestDigest,
        committedOp.decisionId,
      )
      .run();
    const row = () =>
        db
          .prepare(
            "SELECT * FROM product_operations WHERE school_id='another-school' AND operation_id=?",
          )
          .bind(foreign)
          .first(),
      before = await row();
    assert.equal(
      (
        await call(admin, "/receipt", {
          ...recovery(absent),
          operationId: foreign,
        })
      ).state,
      "unknown",
    );
    await request(
      admin,
      "/operations/withdraw",
      withdrawal(absent, { ...committedOp, operationId: foreign }),
    );
    assert.deepEqual(await row(), before);
  });
  await test("same-owner resource, intent, full-wire and original-fence checks reject mismatches", async () => {
    const body = await note(admin, "binding"),
      op = await prepared(admin, body),
      before = await rawOperation(op.operationId),
      version = await snapshot(body.versionId);
    const wrongReceipt = await request(otherAdmin, "/receipt", recovery(body));
    assert.equal(wrongReceipt.status, 403);
    for (const [user, change] of [
      [otherAdmin, {}],
      [admin, { versionId: committedBody.versionId }],
      [admin, { expectedDigest: "0".repeat(64) }],
      [admin, { expectedRequestDigest: "1".repeat(64) }],
      [admin, { operationId: op.operationId }],
      [admin, { expectedFence: op.fence + 1 }],
      [admin, { expectedFence: op.fence - 1 }],
    ]) {
      const result = await request(
        user,
        "/operations/withdraw",
        withdrawal(body, op, change),
      );
      assert(result.status >= 400, JSON.stringify(result));
      assert.deepEqual(await rawOperation(op.operationId), before);
    }
    const wrongVersion = await request(admin, "/receipt", {
      ...recovery(body),
      versionId: committedBody.versionId,
    });
    assert(wrongVersion.status >= 400);
    assert.deepEqual(await snapshot(body.versionId), version);
  });
  await test("publication targets, GET, read-only preview and revoked current permission cannot withdraw", async () => {
    const body = await note(admin, "permissions"),
      op = await prepared(admin, body),
      before = await rawOperation(op.operationId),
      control = withdrawal(body, op);
    assert.equal(
      (
        await request(
          admin,
          "/operations/withdraw?operationId=" + control.operationId,
          undefined,
          { method: "GET" },
        )
      ).status,
      405,
    );
    const preview = await request(admin, "/operations/withdraw", control, {
      headers: { "x-gsis-preview-account": otherAdmin.id },
    });
    assert.equal(preview.status, 403);
    await core
      .prepare(
        "UPDATE core_accounts SET suspended=1,revision=revision+1 WHERE school_id=? AND account_id=?",
      )
      .bind(school, admin.id)
      .run();
    try {
      assert.equal(
        (await request(admin, "/operations/withdraw", control)).status,
        403,
      );
    } finally {
      await core
        .prepare(
          "UPDATE core_accounts SET suspended=0,revision=revision+1 WHERE school_id=? AND account_id=?",
        )
        .bind(school, admin.id)
        .run();
    }
    assert.deepEqual(await rawOperation(op.operationId), before);
    const pub = { ...body, operationId: next("publication") },
      pubOp = await prepared(admin, pub, "/publish"),
      pubBefore = await rawOperation(pubOp.operationId);
    assert(
      (await request(admin, "/operations/withdraw", withdrawal(pub, pubOp)))
        .status >= 400,
    );
    assert((await request(admin, "/receipt", recovery(pub))).status >= 400);
    assert.deepEqual(await rawOperation(pubOp.operationId), pubBefore);
    const historicalPublication = await call(admin, "/receipt", {
      operationId: pubOp.operationId,
    });
    assert.equal(historicalPublication.state, "prepared");
    assert.notEqual(historicalPublication.bindingVerified, true);
  });
  await test("expired historical evidence binds the original request but absent evidence cannot justify abort", async () => {
    const body = await note(admin, "expired"),
      op = await prepared(admin, body);
    await core
      .prepare(
        "UPDATE core_evidence SET valid_until=? WHERE school_id=? AND decision_id=?",
      )
      .bind(Date.now() - 1, school, op.decisionId)
      .run();
    verify(await call(admin, "/receipt", recovery(body)), body, op, "prepared");
    verify(
      await call(admin, "/operations/withdraw", withdrawal(body, op)),
      body,
      op,
      "aborted",
    );
    const missing = await note(admin, "missing-evidence"),
      missingOp = await prepared(admin, missing),
      before = await rawOperation(missingOp.operationId);
    await core
      .prepare("DELETE FROM core_evidence WHERE school_id=? AND decision_id=?")
      .bind(school, missingOp.decisionId)
      .run();
    assert((await request(admin, "/receipt", recovery(missing))).status >= 400);
    assert(
      (
        await request(
          admin,
          "/operations/withdraw",
          withdrawal(missing, missingOp),
        )
      ).status >= 400,
    );
    assert.deepEqual(await rawOperation(missingOp.operationId), before);
  });
  await test("unavailable and malformed historical principals or descriptors fail closed", async () => {
    const body = await note(admin, "historical-negative"),
      op = await prepared(admin, body),
      before = await rawOperation(op.operationId);
    const mutations = [
      (x) => {
        x.principal.actorId = otherAdmin.id;
      },
      (x) => {
        x.principal.schoolId = "another-school";
      },
      (x) => {
        x.principal.requestDigest = "a".repeat(64);
      },
      (x) => {
        x.descriptor.resourceId = committedBody.versionId;
      },
      (x) => {
        x.descriptor.bodyDigest = "b".repeat(64);
      },
      (x) => {
        x.descriptor.operationId = "different";
      },
      (x) => {
        x.descriptor.service = "contacts";
      },
      (x) => {
        x.descriptor.action = "deploy.publish";
      },
      (x) => {
        x.descriptor.write = false;
      },
      (x) => {
        delete x.principal;
      },
      (x) => {
        delete x.descriptor;
      },
    ];
    for (const mutate of mutations) {
      const override = (underlying) => ({
        fetch: async (req) => {
          const r = await underlying.fetch(req);
          if (new URL(req.url).pathname !== "/internal/decision") return r;
          const value = await r.json();
          mutate(value.data);
          return Response.json(value);
        },
      });
      const outcome = await settled(
        direct(admin, "/operations/withdraw", withdrawal(body, op), {
          coreOverride: override,
        }),
      );
      assert.equal(
        outcome.error?.status,
        409,
        "malformed historical evidence must produce a binding denial",
      );
      assert.deepEqual(await rawOperation(op.operationId), before);
    }
    const unavailable = (underlying) => ({
      fetch: (req) =>
        new URL(req.url).pathname === "/internal/decision"
          ? Promise.reject(Error("Synthetic unavailable history"))
          : underlying.fetch(req),
    });
    const failure = await settled(
      direct(admin, "/operations/withdraw", withdrawal(body, op), {
        coreOverride: unavailable,
      }),
    );
    assert.equal(failure.error?.status, 503);
    assert.deepEqual(await rawOperation(op.operationId), before);
  });
  await test("terminal receipts with wrong operation, digest, state or fence cannot settle recovery", async () => {
    const original = committedOp.receipt;
    for (const change of [
      { operationId: "other" },
      { digest: "f".repeat(64) },
      { state: "terminal-not-committed" },
      { fence: committedOp.fence + 1 },
    ]) {
      await db
        .prepare(
          "UPDATE product_operations SET receipt_json=? WHERE school_id=? AND operation_id=?",
        )
        .bind(
          JSON.stringify({ ...original, ...change }),
          school,
          committedOp.operationId,
        )
        .run();
      try {
        assert(
          (await request(admin, "/receipt", recovery(committedBody))).status >=
            400,
        );
        assert(
          (
            await request(
              admin,
              "/operations/withdraw",
              withdrawal(committedBody, committedOp),
            )
          ).status >= 400,
        );
      } finally {
        await db
          .prepare(
            "UPDATE product_operations SET receipt_json=? WHERE school_id=? AND operation_id=?",
          )
          .bind(JSON.stringify(original), school, committedOp.operationId)
          .run();
      }
    }
  });
  await test("withdrawal wins at the actual D1 commit boundary and fences the late original writer", async () => {
    const body = await note(admin, "abort-wins"),
      before = await snapshot(body.versionId),
      gate = barrier();
    let held = false;
    const database = databaseHook(async (statements) => {
      if (!held && commitBatch(statements, body.operationId)) {
        held = true;
        await gate.stop();
      }
      return db.batch(statements);
    });
    const writer = settled(direct(admin, "/change", body, { database }));
    try {
      await waitForGate(gate, writer);
      const op = await operationStatus(db, school, body.operationId);
      const out = await call(
        admin,
        "/operations/withdraw",
        withdrawal(body, op),
      );
      verify(out, body, op, "aborted");
      assert.equal(out.admissionResolution, "resolved");
      gate.release();
      const late = await writer;
      assert.equal(late.error?.status, 409);
      assert.deepEqual(await snapshot(body.versionId), before);
      for (const table of ["product_audit", "product_outbox"]) {
        const count = await db
          .prepare(
            `SELECT COUNT(*) AS n FROM ${table} WHERE school_id=? AND operation_id=?`,
          )
          .bind(school, op.operationId)
          .first();
        assert.equal(count.n, 0, table);
      }
      await assertResolution(op, "resolved");
    } finally {
      gate.release();
      await writer;
    }
  });
  await test("a committed save wins against an already validated withdrawal without fabricated cancellation", async () => {
    const body = await note(admin, "commit-wins"),
      writerGate = barrier(),
      abortGate = barrier();
    let writerHeld = false,
      abortHeld = false;
    const writer = settled(
      direct(admin, "/change", body, {
        database: databaseHook(async (statements) => {
          if (!writerHeld && commitBatch(statements, body.operationId)) {
            writerHeld = true;
            await writerGate.stop();
          }
          return db.batch(statements);
        }),
      }),
    );
    let aborting;
    try {
      await waitForGate(writerGate, writer);
      const op = await operationStatus(db, school, body.operationId);
      aborting = settled(
        direct(admin, "/operations/withdraw", withdrawal(body, op), {
          database: databaseHook(async (statements) => {
            if (!abortHeld && abortBatch(statements, body.operationId)) {
              abortHeld = true;
              await abortGate.stop();
            }
            return db.batch(statements);
          }),
        }),
      );
      await waitForGate(abortGate, aborting);
      writerGate.release();
      const saved = await writer;
      assert(!saved.error, saved.error?.stack);
      const winner = await operationStatus(db, school, body.operationId);
      assert.equal(winner.state, "committed");
      abortGate.release();
      const out = await aborting;
      assert(!out.error, out.error?.stack);
      verify(out.value, body, op, "committed");
      assert.deepEqual(out.value.receipt, winner.receipt);
      assert.equal((await snapshot(body.versionId)).revision, 1);
      await assertResolution(op, "resolved");
    } finally {
      writerGate.release();
      abortGate.release();
      await writer;
      if (aborting) await aborting;
    }
  });
  await test("lost abort acknowledgement recovers the original terminal result and cannot revive the save", async () => {
    const body = await note(admin, "lost-abort"),
      op = await prepared(admin, body),
      before = await snapshot(body.versionId),
      control = withdrawal(body, op);
    let injected = false;
    const outcome = await settled(
      direct(admin, "/operations/withdraw", control, {
        database: databaseHook(async (statements) => {
          const result = await db.batch(statements);
          if (!injected && abortBatch(statements, op.operationId)) {
            injected = true;
            throw Error("Synthetic lost abort acknowledgement");
          }
          return result;
        }),
      }),
    );
    assert(outcome.error);
    assert(injected);
    const durable = await operationStatus(db, school, op.operationId);
    assert.equal(durable.state, "aborted");
    const recovered = await call(admin, "/operations/withdraw", control);
    verify(recovered, body, op, "aborted");
    assert.deepEqual(recovered.receipt, durable.receipt);
    assert.equal((await request(admin, "/change", body)).status, 409);
    assert.deepEqual(await snapshot(body.versionId), before);
  });
  await test("interrupted admission resolution retains durable pins and pending recovery evidence", async () => {
    restartBody = await note(admin, "restart");
    let stopped = false;
    const crashed = await settled(
      direct(admin, "/change", restartBody, {
        database: databaseHook((statements) => {
          if (commitBatch(statements, restartBody.operationId)) {
            stopped = true;
            throw Error("Synthetic process interruption before commit");
          }
          return db.batch(statements);
        }),
      }),
    );
    assert(crashed.error);
    assert(stopped);
    restartOp = await operationStatus(db, school, restartBody.operationId);
    assert.equal(restartOp.state, "prepared");
    restartWithdraw = withdrawal(restartBody, restartOp);
    const outage = (underlying) => ({
      fetch: (req) =>
        [
          "/internal/evidence/receipt",
          "/internal/pins/release",
          "/internal/pins/release-batch",
        ].includes(new URL(req.url).pathname)
          ? Promise.reject(Error("Synthetic source resolution unavailable"))
          : underlying.fetch(req),
    });
    const withdrawn = await direct(
      admin,
      "/operations/withdraw",
      restartWithdraw,
      { coreOverride: outage, contactsOverride: outage },
    );
    verify(withdrawn, restartBody, restartOp, "aborted");
    assert.equal(withdrawn.admissionResolution, "pending");
    await assertResolution(restartOp, "resolving");
  });
  await test("an ordinary accepted SMC and EO can withdraw and release real Contacts admission pins", async () => {
    const editor = await suite.seedAccount("recovery-editor", {
      capabilities: [],
    });
    await suite.call(admin, "contacts", "/staff/create", {
      operationId: next("editor-contact"),
      staffId: editor.staffId,
      basicName: "Synthetic Recovery Teacher",
    });
    await suite.call(admin, "contacts", `/staff/${editor.staffId}/update`, {
      operationId: next("editor-active"),
      changes: { employmentActive: true },
      fieldRevisions: { employmentActive: 0 },
    });
    for (const [field, value] of [
      ["smc", true],
      ["eo", true],
      ["schoolLeader", false],
    ]) {
      await suite.call(admin, "contacts", `/staff/${editor.staffId}/accept`, {
        operationId: next("editor-accept"),
        field,
        value,
        revision: 0,
        ownerReviewReference: "synthetic-owner-review",
      });
    }
    const body = await note(editor, "ordinary-editor");
    const stopped = await settled(
      direct(editor, "/change", body, {
        database: databaseHook((statements) => {
          if (commitBatch(statements, body.operationId))
            throw Error("Synthetic interruption after admission");
          return db.batch(statements);
        }),
      }),
    );
    assert(stopped.error);
    const op = await operationStatus(db, school, body.operationId);
    const contactsDb = await runtime.db("contacts");
    const pins = () =>
      contactsDb
        .prepare(
          "SELECT state FROM source_pins WHERE school_id=? AND destination='deploy' AND operation_id=?",
        )
        .bind(school, op.operationId)
        .all();
    const before = await pins();
    assert(
      before.results.length > 0,
      "ordinary authority must hold real Contacts pins",
    );
    assert(before.results.every((pin) => pin.state === "held"));
    const out = await call(
      editor,
      "/operations/withdraw",
      withdrawal(body, op),
    );
    verify(out, body, op, "aborted");
    assert.equal(out.admissionResolution, "resolved");
    assert((await pins()).results.every((pin) => pin.state === "released"));
    await assertResolution(op, "resolved");
  });
  await test("process restart preserves both terminal winners and finishes original admission resolution", async () => {
    assert(
      restartOp,
      "previous fixture must have a durable interrupted admission",
    );
    const terminal = await operationStatus(db, school, restartOp.operationId),
      version = await snapshot(restartBody.versionId);
    await runtime.mf.dispose();
    runtime = await startProduct({
      persistPath: join(suite.path, "state"),
      output: join(suite.path, "restarted"),
      migrateSchemas: false,
    });
    restarted = true;
    db = await runtime.db("deploy");
    core = await runtime.db("core");
    const recovered = await call(
      admin,
      "/operations/withdraw",
      restartWithdraw,
    );
    verify(recovered, restartBody, restartOp, "aborted");
    assert.deepEqual(recovered.receipt, terminal.receipt);
    assert.equal(recovered.admissionResolution, "resolved");
    await assertResolution(restartOp, "resolved");
    verify(
      await call(admin, "/receipt", recovery(committedBody)),
      committedBody,
      committedOp,
      "committed",
    );
    await call(admin, "/change", committedBody);
    assert.equal((await request(admin, "/change", restartBody)).status, 409);
    assert.deepEqual(await snapshot(restartBody.versionId), version);
    const repeated = await call(admin, "/operations/withdraw", restartWithdraw);
    assert.deepEqual(repeated.receipt, terminal.receipt);
    assert.equal(
      (await operationStatus(db, school, restartOp.operationId)).fence,
      restartOp.fence + 1,
    );
  });
} finally {
  if (restarted) {
    await runtime.close();
    await rm(suite.path, { recursive: true, force: true });
  } else await suite.close();
}
console.log(
  `${passed} Deploy save recovery groups passed; ${failures.length} failed.`,
);
if (failures.length) process.exitCode = 1;
