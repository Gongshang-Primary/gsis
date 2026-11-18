import assert from "node:assert/strict";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { authorizeCore } from "../v1/services/core/service.mjs";
import { recordFinalDenial } from "../v1/services/core/evidence.mjs";
import { digest } from "../v1/runtime/store.mjs";
import { choose } from "../v1/contacts/contracts.mjs";
const started = performance.now(),
  suite = await productSuite();
const schoolId = "synthetic-school";
let restarted,
  originalClosed = false;
try {
  const admin = await suite.seedAccount("denial-admin");
  const user = await suite.seedAccount("denial-user", {
    staffId: "denial-staff",
    capabilities: ["deploy.read", "deploy.edit"],
  });
  let serial = 0;
  const write = (path, body) =>
    suite.call(admin, "contacts", path, {
      operationId: "denial-fixture-" + ++serial,
      ...body,
    });
  await write("/staff/create", {
    staffId: user.staffId,
    basicName: "Synthetic Denial",
    changes: { employmentActive: true },
  });
  for (const [field, value] of [
    ["smc", false],
    ["eo", true],
    ["schoolLeader", false],
  ])
    await write("/staff/" + user.staffId + "/accept", {
      field,
      value,
      revision: 0,
      ownerReviewReference: "synthetic-owner-review",
    });
  const response = await suite.request(user, "deploy", "/versions");
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "CAPABILITY_DENIED");
  assert.equal(response.body.error.retryable, false);
  const db = await suite.db("core"),
    contactsDB = await suite.db("contacts");
  const rows = async () =>
    (
      await db
        .prepare(
          "SELECT * FROM product_audit WHERE school_id=? AND action='core.authority-denial' ORDER BY recorded_at,event_id",
        )
        .bind(schoolId)
        .all()
    ).results;
  const initial = await rows();
  assert.equal(
    initial.length,
    1,
    "Final T1A denial must be captured without becoming an authorization row",
  );
  const row = initial[0],
    record = JSON.parse(row.details_json),
    id = row.event_id;
  assert.equal(record.event.outcome, "deny");
  assert.equal(record.event.requestId, record.evidence.decision.requestId);
  assert.equal(record.event.requestId, record.binding.requestId);
  assert.equal(typeof response.body.error.requestId, "string");
  assert.equal(record.evidence.subject.staffId, user.staffId);
  for (const privateValue of [
    user.token,
    user.csrf,
    "Synthetic Denial",
    "example.invalid",
  ])
    assert(!row.details_json.includes(privateValue));
  assert(!Object.hasOwn(record, "principal"));
  assert(!Object.hasOwn(record.evidence.contacts, "snapshot"));
  const evidence = async (user, id) =>
    suite.request(user, "core", "/evidence/" + id);
  const recovered = await evidence(admin, id);
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(
    recovered.body.data.verification.scope,
    "captured-final-non-allow-decision",
  );
  assert.equal(recovered.body.data.verification.observationRecovered, true);
  assert.equal(recovered.body.data.verification.currentAuthority, false);
  assert.equal(recovered.body.data.verification.operationCommitted, false);
  assert.equal(record.evidence.contacts.observation.evaluationId, id);
  assert.equal(
    recovered.body.data.event.evaluatedAt,
    record.evidence.decision.evaluatedAt,
  );
  console.log(
    "PASS real gateway final denial, minimal audit and immutable observation recovery preserve403/nonretryable",
  );

  const coreWorker = await suite.mf.getWorker("gsis-core");
  const internal = async (path, body) => {
    const r = await coreWorker.fetch("https://gsis.internal" + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gsis-secret": suite.secret,
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const replay = await internal("/internal/decision", {
    schoolId,
    decisionId: id,
    service: "deploy",
    allowHistorical: true,
  });
  assert.equal(replay.status, 409);
  assert.equal(replay.body.error.code, "AUTHORITY_CHANGED");
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM core_evidence WHERE decision_id=?")
        .bind(id)
        .first()
    ).n,
    0,
  );
  assert.equal((await evidence(user, id)).status, 403);
  await db
    .prepare(
      "INSERT INTO product_audit(school_id,event_id,operation_id,actor_id,action,recorded_at,decision_id,details_json) VALUES(?,?,?,?,?,?,?,?)",
    )
    .bind(
      "other-school",
      "foreign-audit",
      row.operation_id,
      row.actor_id,
      row.action,
      row.recorded_at,
      "foreign-audit",
      row.details_json,
    )
    .run();
  assert.equal((await evidence(admin, "foreign-audit")).status, 404);
  const operationId = "denied-write";
  const writeDenial = await suite.request(user, "deploy", "/versions/create", {
    method: "POST",
    body: { operationId, name: "Never create" },
  });
  assert.equal(writeDenial.status, 403);
  assert.equal(
    (
      await (await suite.db("deploy"))
        .prepare(
          "SELECT COUNT(*) n FROM product_operations WHERE operation_id=?",
        )
        .bind(operationId)
        .first()
    ).n,
    0,
  );
  const writeRecord = (await rows())
    .map((x) => JSON.parse(x.details_json))
    .find((x) => x.binding.operationId === operationId);
  assert.equal(writeRecord.event.operationId, operationId);
  assert.deepEqual(
    writeRecord.evidence.contacts.reference,
    record.evidence.contacts.reference,
  );
  assert.notEqual(writeRecord.evidence.contacts.observation.evaluationId, id);
  assert.equal((await suite.request(admin, "deploy", "/versions")).status, 200);
  console.log(
    "PASS no denial principal or business write; Admin/school isolation and unchanged independent Admin allow",
  );

  const original = record.evidence.contacts.reference;
  const history = await contactsDB
    .prepare(
      "SELECT * FROM contacts_snapshots WHERE school_id=? AND snapshot_id=?",
    )
    .bind(schoolId, original.snapshotId)
    .first();
  assert(history);
  const snapshot = JSON.parse(history.body);
  const authority = {
    kind: "current",
    snapshot,
    contentDigest: original.contentDigest,
    observation: record.evidence.contacts.observation,
    fields: Object.fromEntries(
      Object.entries(snapshot.fields).map(([key, value]) => [
        key,
        choose(value, record.evidence.contacts.observation.effectiveAt),
      ]),
    ),
  };
  const params = {
    decision: record.evidence.decision,
    descriptor: record.binding,
    actor: record.evidence.actor,
    subject: record.evidence.subject,
    sessionId: record.binding.sessionId,
    authority,
  };
  const auditEnv = { DB: db, SCHOOL_ID: schoolId };
  assert.equal((await recordFinalDenial(auditEnv, params)).persisted, true);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT details_json FROM product_audit WHERE school_id=? AND event_id=?",
        )
        .bind(schoolId, id)
        .first()
    ).details_json,
    row.details_json,
    "exact event replay preserves original recorded time and evidence",
  );
  assert.equal(
    (
      await recordFinalDenial(auditEnv, {
        ...params,
        descriptor: { ...params.descriptor, bodyDigest: "a".repeat(64) },
      })
    ).persisted,
    false,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT details_json FROM product_audit WHERE school_id=? AND event_id=?",
        )
        .bind(schoolId, id)
        .first()
    ).details_json,
    row.details_json,
  );
  const damaged = structuredClone(record);
  damaged.evidence.contacts.fieldRevisions.eo = "changed";
  await db
    .prepare(
      "UPDATE product_audit SET details_json=? WHERE school_id=? AND event_id=?",
    )
    .bind(JSON.stringify(damaged), schoolId, id)
    .run();
  assert.equal(
    (await evidence(admin, id)).body.error.code,
    "EVIDENCE_INTEGRITY_FAILED",
  );
  await db
    .prepare(
      "UPDATE product_audit SET details_json=? WHERE school_id=? AND event_id=?",
    )
    .bind(row.details_json, schoolId, id)
    .run();
  await contactsDB
    .prepare(
      "UPDATE contacts_snapshots SET body=? WHERE school_id=? AND snapshot_id=?",
    )
    .bind("{}", schoolId, original.snapshotId)
    .run();
  assert.equal(
    (await evidence(admin, id)).body.error.code,
    "EVIDENCE_CONTENT_UNAVAILABLE",
  );
  await contactsDB
    .prepare(
      "UPDATE contacts_snapshots SET body=? WHERE school_id=? AND snapshot_id=?",
    )
    .bind(history.body, schoolId, original.snapshotId)
    .run();
  console.log(
    "PASS duplicate event identity, immutable conflict, tamper and unavailable history fail closed",
  );

  const contactsWorker = await suite.mf.getWorker("gsis-contacts");
  let reads = 0;
  const ce = {
    DB: db,
    SCHOOL_ID: schoolId,
    SERVICE_NAME: "core",
    GSIS_SECRET: suite.secret,
    HOSTED_DOMAIN: "example.invalid",
    PUBLIC_ORIGIN: origin,
    CONTACTS: {
      fetch: async (request) =>
        ++reads === 2
          ? Promise.resolve(
              Response.json(
                {
                  ok: false,
                  error: {
                    code: "DEPENDENCY_UNAVAILABLE",
                    message: "Synthetic outage",
                  },
                },
                { status: 503 },
              ),
            )
          : contactsWorker.fetch(request.url, {
              method: request.method,
              headers: Object.fromEntries(request.headers),
              body: await request.text(),
            }),
    },
  };
  const unavailableRequest = "final-unavailable";
  let unavailable;
  try {
    await authorizeCore(
      ce,
      {
        schoolId,
        sessionToken: user.token,
        descriptor: {
          service: "deploy",
          action: "deploy.read",
          write: false,
          requestId: unavailableRequest,
          bodyDigest: await digest({}),
        },
      },
      Date.now(),
    );
  } catch (error) {
    unavailable = error;
  }
  assert.equal(
    reads,
    2,
    "controlled outage must reach final reader: " +
      unavailable?.code +
      " " +
      unavailable?.message,
  );
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.retryable, true);
  const missing = (await rows())
    .map((x) => JSON.parse(x.details_json))
    .find((x) => x.binding.requestId === unavailableRequest);
  assert(missing);
  assert.equal(missing.event.reasonCode, unavailable.code);
  assert.equal(
    missing.evidence.contacts.kind,
    "not-captured",
    "the earlier successful read must not impersonate the final failed observation",
  );
  const missingRecovered = await evidence(admin, missing.event.eventId);
  assert.equal(
    missingRecovered.body.data.verification.observationRecovered,
    false,
  );
  assert.equal(
    missingRecovered.body.data.verification.contacts,
    "not-captured",
  );
  reads = 0;
  ce.CONTACTS = {
    fetch: async (request) => {
      const reply = await contactsWorker.fetch(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: await request.text(),
      });
      if (++reads === 2)
        await db
          .prepare(
            "UPDATE core_accounts SET revision=revision+1 WHERE school_id=? AND account_id=?",
          )
          .bind(schoolId, user.id)
          .run();
      return reply;
    },
  };
  let changed;
  try {
    await authorizeCore(
      ce,
      {
        schoolId,
        sessionToken: user.token,
        descriptor: {
          service: "deploy",
          action: "deploy.read",
          write: false,
          requestId: "final-stale",
          bodyDigest: await digest({}),
        },
      },
      Date.now(),
    );
  } catch (error) {
    changed = error;
  }
  assert.equal(changed?.code, "AUTHORITY_CHANGED");
  assert.equal(changed.status, 409);
  assert.equal(changed.retryable, true);
  const stale = (await rows())
    .map((x) => JSON.parse(x.details_json))
    .find((x) => x.binding.requestId === "final-stale");
  assert.equal(stale.evidence.contacts.kind, "observed");
  assert(
    stale.evidence.contacts.observation.effectiveAt >=
      stale.evidence.decision.evaluatedAt,
  );
  const staleRecovered = await evidence(admin, stale.event.eventId);
  assert.equal(staleRecovered.status, 200, JSON.stringify(staleRecovered.body));
  assert.equal(
    staleRecovered.body.data.verification.observationRecovered,
    true,
  );
  assert.equal(
    staleRecovered.body.data.event.evaluatedAt,
    stale.evidence.decision.evaluatedAt,
    "do not rewrite a failed resolver's evaluation timestamp to fit observation ordering",
  );

  const beforePreliminary = (await rows()).length;
  const preliminaryUser = await suite.seedAccount("preliminary-only", {
    staffId: user.staffId,
    capabilities: [],
  });
  const preliminary = await suite.request(
    preliminaryUser,
    "deploy",
    "/versions",
  );
  assert.equal(preliminary.status, 403);
  assert.equal(
    (await rows()).length,
    beforePreliminary,
    "preliminary failures are not fabricated final T1A decisions",
  );
  assert(!JSON.stringify(missing).includes("Synthetic outage"));
  console.log(
    "PASS controlled final outage503/revision-race409 retain distinct observation times; earlier failures stay uncaptured",
  );

  const beforeFailure = (await rows()).length;
  await db
    .prepare(
      "CREATE TRIGGER fail_denial_audit BEFORE INSERT ON product_audit WHEN NEW.action='core.authority-denial' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END",
    )
    .run();
  const failedCapture = await suite.request(user, "deploy", "/versions");
  assert.equal(failedCapture.status, 403);
  assert.equal(failedCapture.body.error.code, "CAPABILITY_DENIED");
  assert.equal(failedCapture.body.error.retryable, false);
  assert.equal((await rows()).length, beforeFailure);
  await db.prepare("DROP TRIGGER fail_denial_audit").run();
  const malformed = await recordFinalDenial(auditEnv, {
    ...params,
    decision: { ...params.decision, requestId: null },
  });
  assert.equal(malformed.persisted, false);
  assert.equal(malformed.status, "unconfirmed");
  let release, completed;
  const blocked = new Promise((resolve) => (release = resolve)),
    finished = new Promise((resolve) => (completed = resolve));
  const lateId = "late-audit-completion";
  const lateEnv = {
    ...auditEnv,
    DB: {
      prepare(sql) {
        const real = db.prepare(sql);
        return {
          bind(...args) {
            const bound = real.bind(...args);
            return {
              ...bound,
              run: async () => {
                await blocked;
                const result = await bound.run();
                completed();
                return result;
              },
            };
          },
        };
      },
    },
  };
  const unknown = await recordFinalDenial(lateEnv, {
    ...params,
    decision: { ...params.decision, decisionId: lateId },
    authority: null,
  });
  assert.equal(unknown.status, "unconfirmed");
  assert.equal(unknown.persisted, false);
  release();
  await finished;
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM product_audit WHERE event_id=?")
        .bind(lateId)
        .first()
    ).n,
    1,
    "audit timeout is unknown completion, not proof of absence",
  );
  console.log(
    "PASS failed/malformed/late audit capture cannot change authority response or fabricate persistence",
  );

  // Restart the actual Workers with the same owner stores, without reapplying schemas.
  await suite.mf.dispose();
  originalClosed = true;
  restarted = await startProduct({
    persistPath: join(suite.path, "state"),
    output: join(suite.path, "product"),
    migrateSchemas: false,
    bindings: { GSIS_SECRET: suite.secret },
  });
  const afterRestart = await restarted.mf.dispatchFetch(
    origin + "/api/core/evidence/" + id,
    { headers: { cookie: "__Host-gsis_session=" + admin.token, origin } },
  );
  assert.equal(afterRestart.status, 200);
  const recoveredAgain = (await afterRestart.json()).data;
  assert.deepEqual(recoveredAgain.evidence, record.evidence);
  assert.equal(recoveredAgain.verification.observationRecovered, true);
  assert.equal(recoveredAgain.verification.currentAuthority, false);
  console.log(
    "PASS actual fresh Worker restart recovers original final denial and observation without re-evaluation",
  );
  console.log(
    `6 final-denial evidence groups passed in ${((performance.now() - started) / 1000).toFixed(3)}s`,
  );
} finally {
  if (restarted) await restarted.close();
  if (originalClosed) await rm(suite.path, { recursive: true, force: true });
  else await suite.close();
}
