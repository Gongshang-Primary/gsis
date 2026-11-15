import assert from "node:assert/strict";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { recoverSave } from "../v1/services/contacts/settings.mjs";
import { gridReceipt } from "../v1/services/contacts/grid.mjs";
import { admit, serviceCall } from "../v1/runtime/admission.mjs";
import {
  digest,
  operationStatus,
  prepareOperation,
  commitOperation,
} from "../v1/runtime/store.mjs";

// Real local Workers/D1 throughout. The two controlled races pause the owning
// handler at its D1 abort batch, then execute the competing real writer.
const suite = await productSuite();
let active = suite,
  restarted,
  initialDisposed = false,
  passed = 0;
const school = "synthetic-school";
const done = (name) => {
  passed++;
  console.log("PASS " + name);
};
async function request(user, path, body, headers = {}) {
  const response = await active.mf.dispatchFetch(
    origin + "/api/contacts" + path,
    {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: "__Host-gsis_session=" + user.token,
        "x-csrf-token": user.csrf,
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
  return { status: response.status, body: await response.json() };
}
async function call(user, path, body) {
  const response = await request(user, path, body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}
const addition = (operationId, name, extra = {}) => ({
  operationId,
  changes: [],
  additions: [{ id: "new-person", values: { "Basic Name": name, ...extra } }],
});
try {
  const admin = await suite.seedAccount("recovery-admin");
  const power = await suite.seedAccount("recovery-power", {
    capabilities: ["contacts.powerUser"],
  });
  const reader = await suite.seedAccount("recovery-reader", {
    capabilities: [],
  });
  let db = await active.db("contacts");
  const invalid = addition("grid-invalid-date", "Synthetic Recovery Person", {
    "Day of Birth": "31",
    "Month of birth": "2",
  });
  const rejected = await request(admin, "/save-data", invalid);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.code, "INVALID_INPUT");
  const original = await operationStatus(db, school, invalid.operationId);
  assert.equal(original.state, "aborted");
  assert.equal(original.receipt.state, "terminal-not-committed");
  assert.equal(original.receipt.result, undefined);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM contacts_staff").first()).n,
    0,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM product_audit WHERE operation_id=?")
        .bind(invalid.operationId)
        .first()
    ).n,
    0,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM product_outbox WHERE operation_id=?",
        )
        .bind(invalid.operationId)
        .first()
    ).n,
    0,
  );
  const receiptResponse = await request(admin, "/save-receipt", {
    operationId: invalid.operationId,
  });
  assert.equal(
    receiptResponse.status,
    200,
    "A durably rejected grid save must have a readable terminal receipt, not a 503",
  );
  const receipt = receiptResponse.body.data;
  assert.equal(receipt.saved, false);
  assert.equal(receipt.state, "aborted");
  assert.deepEqual(receipt.receipt, original.receipt);
  assert.equal(receipt.mapping, undefined);
  const replay = await call(admin, "/save-data", invalid);
  assert.equal(replay.saved, false);
  assert.deepEqual(replay.receipt, original.receipt);
  assert.equal(replay.mapping, undefined);
  const changed = await request(
    admin,
    "/save-data",
    addition(invalid.operationId, "Different Synthetic Person"),
  );
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error.code, "OPERATION_INTENT_CONFLICT");
  done(
    "known date rejection retains an immutable readable abort; replay cannot change intent",
  );

  const good = addition("grid-corrected", "Synthetic Recovery Person");
  // The writer completed; deliberately discard its response before reconciliation.
  await call(admin, "/save-data", good);
  const confirmed = await call(admin, "/save-receipt", {
    operationId: good.operationId,
  });
  assert.equal(confirmed.saved, true);
  assert.equal(confirmed.receipt.state, "committed");
  const staffId = confirmed.mapping["new-person"];
  const repeated = await call(admin, "/save-data", good);
  assert.deepEqual(repeated.receipt, confirmed.receipt);
  assert.deepEqual(repeated.mapping, confirmed.mapping);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM contacts_staff").first()).n,
    1,
  );
  const puSave = await call(power, "/save-data", {
    operationId: "power-update",
    changes: [
      {
        id: staffId,
        field: "Basic Name",
        expected: "Synthetic Recovery Person",
        value: "Synthetic Updated Person",
      },
    ],
    additions: [],
  });
  assert.equal(puSave.saved, true);
  const own = await suite.seedAccount("recovery-own", {
    capabilities: [],
    staffId,
  });
  const diy = {
    operationId: "own-diy",
    staffId,
    changes: [
      { id: staffId, field: "Mobile No", expected: "", value: "+6500000001" },
    ],
  };
  const diySaved = await call(own, "/save-diy", diy);
  assert.equal(diySaved.saved, true);
  assert.deepEqual(
    (await call(own, "/save-receipt", { operationId: diy.operationId }))
      .receipt,
    diySaved.receipt,
  );
  done(
    "response-loss reconciliation, Admin/Power User saves and own DIY preserve one committed result",
  );

  const unknown = await call(admin, "/save-receipt", {
    operationId: "never-received",
  });
  assert.deepEqual(unknown, { saved: false, state: "unknown" });
  const forbiddenReceipt = await request(reader, "/save-receipt", {
    operationId: good.operationId,
  });
  assert.equal(forbiddenReceipt.status, 403);
  const forbiddenSave = await request(
    reader,
    "/save-data",
    addition("reader-denied", "Never Added"),
  );
  assert.equal(forbiddenSave.status, 403);
  const wrongDigest = await request(admin, "/save-receipt", {
    operationId: invalid.operationId,
    digest: "wrong",
  });
  assert.equal(wrongDigest.status, 409);
  assert.equal(wrongDigest.body.error.code, "OPERATION_INTENT_CONFLICT");
  const wrongRecovery = await request(admin, "/recover-save", {
    operationId: invalid.operationId,
    digest: "wrong",
  });
  assert.equal(wrongRecovery.status, 409);
  assert.equal(
    (
      await request(admin, "/recover-save", {
        operationId: invalid.operationId,
        digest: "",
      })
    ).status,
    409,
  );
  const forbiddenRecovery = await request(power, "/recover-save", {
    operationId: good.operationId,
  });
  assert.equal(
    forbiddenRecovery.status,
    403,
    "Power User may not recover another actor's save",
  );
  const preview = await request(
    admin,
    "/recover-save",
    { operationId: invalid.operationId },
    { "x-gsis-preview-account": power.id },
  );
  assert.equal(preview.status, 403);
  const foreign = await gridReceipt({
    env: { SCHOOL_ID: "another-school", DB: db },
    body: { operationId: good.operationId },
    principal: { actorId: admin.id, capabilities: ["admin"] },
  });
  assert.deepEqual(foreign, { saved: false, state: "unknown" });
  assert.deepEqual(
    (await operationStatus(db, school, invalid.operationId)).receipt,
    original.receipt,
  );
  done(
    "unknown outcomes, receipt identity, school isolation and mutation permissions remain distinct",
  );

  async function binding(name) {
    const worker = await active.mf.getWorker("gsis-" + name);
    return {
      fetch: async (request) =>
        worker.fetch(request.url, {
          method: request.method,
          headers: Object.fromEntries(request.headers),
          body: await request.text(),
        }),
    };
  }
  async function prepareRace(body) {
    const env = {
      SCHOOL_ID: school,
      SERVICE_NAME: "contacts",
      GSIS_SECRET: suite.secret,
      DB: db,
      CORE: await binding("core"),
      CONTACTS: await binding("contacts"),
    };
    const principal = await serviceCall(env, "core", "/internal/authorize", {
      schoolId: school,
      sessionToken: admin.token,
      csrfToken: admin.csrf,
      origin,
      descriptor: {
        service: "contacts",
        action: "contacts.manage",
        write: true,
        resourceId: "directory",
        operationId: body.operationId,
        bodyDigest: await digest(body),
        requestId: crypto.randomUUID(),
      },
    });
    const now = Date.now();
    const op = await prepareOperation(db, {
      schoolId: school,
      actorId: principal.actorId,
      operationId: body.operationId,
      action: "contacts.manage",
      intent: { changes: body.changes, additions: body.additions ?? [] },
      now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
    const admission = await admit(env, db, op, principal, [], now);
    return { env, principal, op, admission };
  }
  // An earlier input schema may already have prepared this exact intent.
  // New lexical preflight must not hide its original durable outcome.
  const oldShape = addition(
    "pre-upgrade-prepared",
    "Synthetic Legacy Pending",
    { Role: "Legacy,role" },
  );
  const preparedOld = await prepareRace(oldShape);
  assert.equal(preparedOld.op.state, "prepared");
  const rejectedOld = await request(admin, "/save-data", oldShape);
  assert.equal(rejectedOld.status, 400);
  const oldTerminal = await call(admin, "/save-receipt", {
    operationId: oldShape.operationId,
  });
  assert.equal(oldTerminal.receipt.state, "terminal-not-committed");
  const oldReplay = await call(admin, "/save-data", oldShape);
  assert.deepEqual(oldReplay.receipt, oldTerminal.receipt);
  assert.equal(oldReplay.saved, false);
  const changedOld = await request(admin, "/save-data", {
    ...oldShape,
    additions: [
      {
        ...oldShape.additions[0],
        values: { "Basic Name": "Changed old intent", Role: "Different,role" },
      },
    ],
  });
  assert.equal(changedOld.status, 409);
  assert.equal(changedOld.body.error.code, "OPERATION_INTENT_CONFLICT");
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM product_audit WHERE operation_id=?")
        .bind(oldShape.operationId)
        .first()
    ).n,
    0,
  );
  done(
    "pre-upgrade prepared input terminalises safely; original receipt replay precedes new validation and changed intent still rejects",
  );

  const winningBody = addition(
    "commit-wins-recovery",
    "Synthetic Commit Winner",
  );
  const winning = await prepareRace(winningBody);
  assert.equal(
    (
      await call(admin, "/save-receipt", {
        operationId: winningBody.operationId,
      })
    ).writing,
    true,
  );
  let interleaved = false,
    winner;
  const racingDb = {
    prepare: db.prepare,
    async batch(statements) {
      if (
        !interleaved &&
        statements.some((s) =>
          /UPDATE product_operations SET state='aborted'/.test(s.sql),
        )
      ) {
        interleaved = true;
        winner = await call(admin, "/save-data", winningBody);
      }
      return db.batch(statements);
    },
  };
  const commitWon = await recoverSave({
    env: { ...winning.env, DB: racingDb },
    principal: winning.principal,
    body: { operationId: winningBody.operationId, digest: winning.op.digest },
    now: Date.now(),
  });
  assert.equal(
    interleaved,
    true,
    "The real commit must occur between recovery's prepared read and abort batch",
  );
  assert.equal(
    commitWon.saved,
    true,
    "Recovery cannot report abort when the original commit won",
  );
  assert.equal(commitWon.state, "committed");
  assert.deepEqual(commitWon.receipt, winner.receipt);
  assert.deepEqual(commitWon.mapping, winner.mapping);
  assert.equal(
    (
      await db
        .prepare("SELECT state FROM product_admissions WHERE operation_id=?")
        .bind(winningBody.operationId)
        .first()
    ).state,
    "resolved",
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM contacts_staff WHERE basic_name='Synthetic Commit Winner'",
        )
        .first()
    ).n,
    1,
  );
  done(
    "commit wins the controlled recovery race and returns its original result and resolved admission",
  );

  const losingBody = addition("abort-wins-recovery", "Synthetic Abort Loser");
  const losing = await prepareRace(losingBody);
  const abortWon = await call(admin, "/recover-save", {
    operationId: losingBody.operationId,
    digest: losing.op.digest,
  });
  assert.equal(abortWon.saved, false);
  assert.equal(abortWon.state, "aborted");
  assert.equal(abortWon.receipt.state, "terminal-not-committed");
  assert.equal(
    (await operationStatus(db, school, losingBody.operationId)).fence,
    losing.op.fence + 1,
  );
  await assert.rejects(
    () =>
      commitOperation(db, losing.op, {
        now: Date.now(),
        admission: losing.admission,
        writes: [
          {
            sql: "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name) VALUES(?,?,?,?)",
            args: [
              school,
              "must-not-exist",
              "Never committed",
              "Never committed",
            ],
          },
        ],
        result: { mapping: { "new-person": "must-not-exist" } },
      }),
    (error) => error.code === "OPERATION_ABORTED",
  );
  const lateReplay = await call(admin, "/save-data", losingBody);
  assert.equal(lateReplay.saved, false);
  assert.deepEqual(lateReplay.receipt, abortWon.receipt);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM contacts_staff WHERE staff_id='must-not-exist' OR basic_name='Synthetic Abort Loser'",
        )
        .first()
    ).n,
    0,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT state FROM product_admissions WHERE operation_id=?")
        .bind(losingBody.operationId)
        .first()
    ).state,
    "resolved",
  );
  done(
    "abort wins, resolves authority pins and fences a late commit and original replay",
  );

  const paused = await prepareRace(
    addition("restart-prepared", "Synthetic Prepared Person"),
  );
  await assert.rejects(
    () =>
      recoverSave({
        env: {
          ...paused.env,
          DB: {
            prepare: db.prepare,
            batch: async () => {
              throw Error("Synthetic storage outage before abort");
            },
          },
        },
        principal: paused.principal,
        body: { operationId: paused.op.operationId },
        now: Date.now(),
      }),
    /Synthetic storage outage before abort/,
  );
  assert.equal(
    (await operationStatus(db, school, paused.op.operationId)).state,
    "prepared",
    "A failed recovery request does not prove a durable abort",
  );
  await suite.mf.dispose();
  initialDisposed = true;
  restarted = await startProduct({
    output: join(suite.path, "product"),
    persistPath: join(suite.path, "state"),
    migrateSchemas: false,
    bindings: { GSIS_SECRET: suite.secret },
  });
  active = restarted;
  db = await active.db("contacts");
  assert.deepEqual(
    (await call(admin, "/save-receipt", { operationId: invalid.operationId }))
      .receipt,
    original.receipt,
  );
  assert.deepEqual(
    (await call(admin, "/save-receipt", { operationId: good.operationId }))
      .receipt,
    confirmed.receipt,
  );
  const retained = await call(admin, "/save-receipt", {
    operationId: paused.op.operationId,
  });
  assert.equal(retained.state, "prepared");
  assert.equal(retained.writing, true);
  assert.equal(retained.saved, false);
  const recovered = await call(admin, "/recover-save", {
    operationId: paused.op.operationId,
    digest: paused.op.digest,
  });
  assert.equal(recovered.receipt.state, "terminal-not-committed");
  assert.equal(
    (await call(admin, "/save-receipt", { operationId: "never-received" }))
      .state,
    "unknown",
  );
  done(
    "Worker restart preserves committed, aborted, prepared and absent outcomes without isolate memory",
  );
  const coreDb = await active.db("core");
  await coreDb
    .prepare(
      "DELETE FROM core_grants WHERE school_id=? AND account_id=? AND capability='contacts.powerUser'",
    )
    .bind(school, power.id)
    .run();
  const revoked = await request(power, "/recover-save", {
    operationId: "power-update",
  });
  assert.equal(
    revoked.status,
    403,
    "A former manager cannot recover using a stale browser capability",
  );
  assert.equal(
    (await call(power, "/save-receipt", { operationId: "power-update" })).saved,
    true,
    "Own receipt remains readable without granting management writes",
  );
  done(
    "current permission revalidation governs recovery after a role is removed",
  );
} finally {
  await restarted?.close();
  if (initialDisposed) await rm(suite.path, { recursive: true, force: true });
  else await suite.close();
}
console.log(
  `PASS ${passed} actual Worker/D1 Contacts recovery groups. Runtime UAT Not tested.`,
);
