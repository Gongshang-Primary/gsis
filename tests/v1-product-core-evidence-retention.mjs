// Core decision evidence and admission retention/compaction (F5 Stage 4).
// Verifies dryRun preview, RETENTION_DELETE_ENABLED guard (default false -> 409),
// bounded deletion of expired/terminal rows only, preservation of active/recent/held rows,
// idempotent operationId replay, audit trail, and Global Admin enforcement.
import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";

const DAY = 86400000;
const SCHOOL = "synthetic-school";

async function seedRetentionFixture(core, now) {
  const oldTs = now - 120 * DAY;
  const recentTs = now - 10 * DAY;

  const insertEvidence = (id, createdAt, validUntil) =>
    core
      .prepare(
        "INSERT INTO core_evidence(school_id,decision_id,event_json,evidence_json,principal_json,descriptor_json,intent_digest,created_at,valid_until) VALUES(?,?, '{}','{}','{}','{}',NULL,?,?)",
      )
      .bind(SCHOOL, id, createdAt, validUntil)
      .run();

  const insertAdmission = (opId, decisionId, state, validUntil) =>
    core
      .prepare(
        "INSERT INTO product_admissions(school_id,operation_id,fence,digest,decision_id,valid_until,pins_json,state) VALUES(?,?,1,'dig-1',?,?,'[]',?)",
      )
      .bind(SCHOOL, opId, decisionId, validUntil, state)
      .run();

  await insertEvidence("ev-old-terminal", oldTs, oldTs);
  await insertEvidence("ev-old-held-admission", oldTs, oldTs);
  await insertEvidence("ev-old-held-pin", oldTs, oldTs);
  await insertEvidence("ev-recent", recentTs, recentTs);

  await core
    .prepare(
      "INSERT INTO core_destination_receipts(school_id,decision_id,destination,operation_id,digest,receipt_json,recorded_at) VALUES(?,'ev-old-terminal','contacts','op-old-resolved','dig-1','{}',?)",
    )
    .bind(SCHOOL, oldTs)
    .run();

  await insertAdmission("op-old-resolved", "ev-old-terminal", "resolved", oldTs);
  await insertAdmission("op-old-aborted", "ev-old-terminal", "aborted", oldTs);
  await insertAdmission("op-old-ready", "ev-old-held-admission", "ready", oldTs);
  await insertAdmission("op-recent-resolved", "ev-recent", "resolved", recentTs);

  await core
    .prepare(
      "INSERT INTO source_pins(school_id,scope,pin_id,destination,operation_id,digest,fence,revision,valid_until,decision_id,state,created_at) VALUES(?,'scope-1','pin-held-1','contacts','op-pin-1','dig-1',1,'1',?,'ev-old-held-pin','held',?)",
    )
    .bind(SCHOOL, oldTs, oldTs)
    .run();
}

// 1. Default-disabled suite (RETENTION_DELETE_ENABLED = "false").
{
  const suite = await productSuite({
    bindings: { RETENTION_DELETE_ENABLED: "false" },
  });
  try {
    const admin = await suite.seedAccount("ret-admin-disabled");
    const staff = await suite.seedAccount("ret-staff-disabled", {
      capabilities: [],
    });
    const core = await suite.db("core");
    await seedRetentionFixture(core, Date.now());

    const health = await suite.request(admin, "core", "/admin/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.data.retentionDeletionEnabled, false);

    // Non-admin denied.
    const denied = await suite.request(staff, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-deny-1", dryRun: true, retentionDays: 90 },
    });
    assert.equal(denied.status, 403);

    // Invalid retentionDays (< 30) rejected.
    const badDays = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-bad-days", dryRun: true, retentionDays: 7 },
    });
    assert.equal(badDays.status, 400);

    // Dry run works even when deletion is disabled, and deletes nothing.
    const preview = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-preview-1", dryRun: true, retentionDays: 90 },
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.data.dryRun, true);
    assert.equal(preview.body.data.retentionDeletionEnabled, false);
    assert.equal(preview.body.data.eligible.evidence, 1);
    assert.equal(preview.body.data.eligible.admissions, 2);
    assert.equal(preview.body.data.deleted.evidence, 0);
    assert.equal(preview.body.data.deleted.admissions, 0);

    // Destructive run refused with 409 RETENTION_DISABLED.
    const refused = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-refused-1", dryRun: false, retentionDays: 90 },
    });
    assert.equal(refused.status, 409, JSON.stringify(refused.body));
    assert.equal(refused.body.error?.code, "RETENTION_DISABLED");

    const evCount = (
      await core
        .prepare("SELECT count(*) AS n FROM core_evidence WHERE decision_id='ev-old-terminal'")
        .first()
    ).n;
    assert.equal(evCount, 1, "disabled retention must not delete any rows");
  } finally {
    await suite.close();
  }
}

// 2. Explicitly enabled suite (RETENTION_DELETE_ENABLED = "true").
{
  const suite = await productSuite({
    bindings: { RETENTION_DELETE_ENABLED: "true" },
  });
  try {
    const admin = await suite.seedAccount("ret-admin-enabled");
    const core = await suite.db("core");
    await seedRetentionFixture(core, Date.now());

    const health = await suite.request(admin, "core", "/admin/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.data.retentionDeletionEnabled, true);

    // A destructive run without the confirmed dry-run digest is refused.
    const unbound = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-exec-unbound", dryRun: false, retentionDays: 90, limit: 500 },
    });
    assert.equal(unbound.status, 409, JSON.stringify(unbound.body));
    assert.equal(unbound.body.error?.code, "PREVIEW_CHANGED");
    const execPreview = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-exec-preview", dryRun: true, retentionDays: 90, limit: 500 },
    });
    assert.equal(execPreview.status, 200, JSON.stringify(execPreview.body));
    const execDigest = execPreview.body.data.previewDigest;
    const run1 = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: {
        operationId: "ret-exec-1",
        dryRun: false,
        retentionDays: 90,
        limit: 500,
        previewDigest: execDigest,
      },
    });
    assert.equal(run1.status, 200, JSON.stringify(run1.body));
    assert.equal(run1.body.data.state, "committed");
    assert.equal(run1.body.data.result.dryRun, false);
    assert.equal(run1.body.data.result.deleted.evidence, 1);
    assert.equal(run1.body.data.result.deleted.admissions, 2);

    // A retry after a lost response, with the same operation and digest,
    // returns the original receipt even though a fresh preview now differs.
    const replay = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: {
        operationId: "ret-exec-1",
        dryRun: false,
        retentionDays: 90,
        limit: 500,
        previewDigest: execDigest,
      },
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.data.state, "committed");
    assert.equal(replay.body.data.result.deleted.evidence, 1);
    assert.equal(replay.body.data.result.deleted.admissions, 2);

    // Verify exact deletions and preservations in D1.
    const remainingEv = new Set(
      (
        await core
          .prepare(
            "SELECT decision_id FROM core_evidence WHERE school_id=? AND decision_id LIKE 'ev-%'",
          )
          .bind(SCHOOL)
          .all()
      ).results.map((r) => r.decision_id),
    );
    assert(!remainingEv.has("ev-old-terminal"), "expired terminal evidence deleted");
    assert(
      remainingEv.has("ev-old-held-admission"),
      "evidence referenced by active admission preserved",
    );
    assert(
      remainingEv.has("ev-old-held-pin"),
      "evidence referenced by held source pin preserved",
    );
    assert(remainingEv.has("ev-recent"), "recent evidence preserved");

    const remainingReceipts = (
      await core
        .prepare(
          "SELECT count(*) AS n FROM core_destination_receipts WHERE school_id=? AND decision_id='ev-old-terminal'",
        )
        .bind(SCHOOL)
        .first()
    ).n;
    assert.equal(remainingReceipts, 0, "destination receipts for compacted evidence deleted");

    const remainingAdm = new Set(
      (
        await core
          .prepare(
            "SELECT operation_id FROM product_admissions WHERE school_id=? AND operation_id LIKE 'op-%'",
          )
          .bind(SCHOOL)
          .all()
      ).results.map((r) => r.operation_id),
    );
    assert(!remainingAdm.has("op-old-resolved"), "old resolved admission deleted");
    assert(!remainingAdm.has("op-old-aborted"), "old aborted admission deleted");
    assert(remainingAdm.has("op-old-ready"), "active unrecovered admission preserved");
    assert(remainingAdm.has("op-recent-resolved"), "recent resolved admission preserved");

    // Durable audit entry recorded.
    const auditRow = await core
      .prepare(
        "SELECT details_json FROM product_audit WHERE school_id=? AND operation_id='ret-exec-1'",
      )
      .bind(SCHOOL)
      .first();
    assert(auditRow, "audit entry recorded for retention run");
    const details = JSON.parse(auditRow.details_json);
    assert.equal(details.kind, "evidence-retention");
    assert.equal(details.deletedEvidence, 1);
    assert.equal(details.deletedAdmissions, 2);
    assert.ok(
      Array.isArray(details.compactDecisions) &&
        details.compactDecisions.length === 1 &&
        details.compactDecisions[0].decisionId === "ev-old-terminal",
      "compact retained audit summary records compacted decision reference",
    );
  } finally {
    await suite.close();
  }
}

// 3. Cross-owner unresolved admission protection, stale preview 409 refusal, and recovery after unrelated cleanup.
{
  const suite = await productSuite({
    bindings: { RETENTION_DELETE_ENABLED: "true" },
  });
  try {
    const admin = await suite.seedAccount("ret-admin-cross-owner");
    const core = await suite.db("core");
    const deploy = await suite.db("deploy");
    const contacts = await suite.db("contacts");
    const oldTs = Date.now() - 120 * DAY;

    await core
      .prepare(
        "INSERT INTO core_evidence(school_id,decision_id,event_json,evidence_json,principal_json,descriptor_json,intent_digest,created_at,valid_until) VALUES(?,?,'{\"outcome\":\"authorized\"}','{}','{\"actorId\":\"a1\",\"action\":\"deploy.edit\"}','{}',NULL,?,?)",
      )
      .bind(SCHOOL, "ev-cross-resolving", oldTs, oldTs)
      .run();
    await core
      .prepare(
        "INSERT INTO core_evidence(school_id,decision_id,event_json,evidence_json,principal_json,descriptor_json,intent_digest,created_at,valid_until) VALUES(?,?,'{\"outcome\":\"authorized\"}','{}','{\"actorId\":\"a2\",\"action\":\"contacts.edit\"}','{}',NULL,?,?)",
      )
      .bind(SCHOOL, "ev-cross-settled", oldTs, oldTs)
      .run();

    // Unresolved admission exists ONLY in Deploy's D1, not in Core's D1.
    await deploy
      .prepare(
        "INSERT INTO product_admissions(school_id,operation_id,fence,digest,decision_id,valid_until,pins_json,state) VALUES(?,'op-deploy-resolving',1,'dig-d','ev-cross-resolving',?,'[]','resolving')",
      )
      .bind(SCHOOL, oldTs)
      .run();

    const preview1 = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-cross-preview-1", dryRun: true, retentionDays: 90 },
    });
    assert.equal(preview1.status, 200, JSON.stringify(preview1.body));
    const p1 = preview1.body.data;
    assert.match(p1.previewDigest, /^[a-f0-9]{64}$/);
    assert.equal(p1.eligible.evidence, 1, "only settled evidence is eligible");
    assert.equal(p1.protected.count, 1, "cross-owner resolving evidence is protected");
    assert.equal(
      p1.protected.reasons["ev-cross-resolving"],
      "unresolved-owner-dependency:deploy",
    );

    // Newly resolving dependency appears in Contacts after preview -> stale previewDigest refused with 409.
    await contacts
      .prepare(
        "INSERT INTO product_admissions(school_id,operation_id,fence,digest,decision_id,valid_until,pins_json,state) VALUES(?,'op-contacts-new',1,'dig-c','ev-cross-settled',?,'[]','acquiring')",
      )
      .bind(SCHOOL, oldTs)
      .run();
    const staleExec = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: {
        operationId: "ret-cross-stale-1",
        dryRun: false,
        retentionDays: 90,
        previewDigest: p1.previewDigest,
      },
    });
    assert.equal(staleExec.status, 409, "stale preview must be refused with 409");
    assert.equal(staleExec.body.error?.code, "PREVIEW_CHANGED");

    // Clear the transient Contacts admission, re-preview, and execute cleanup of unrelated settled evidence.
    await contacts
      .prepare("DELETE FROM product_admissions WHERE school_id=? AND operation_id='op-contacts-new'")
      .bind(SCHOOL)
      .run();
    const preview2 = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-cross-preview-2", dryRun: true, retentionDays: 90 },
    });
    assert.equal(preview2.status, 200);
    const exec2 = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: {
        operationId: "ret-cross-exec-2",
        dryRun: false,
        retentionDays: 90,
        previewDigest: preview2.body.data.previewDigest,
      },
    });
    assert.equal(exec2.status, 200, JSON.stringify(exec2.body));
    assert.equal(exec2.body.data.result.deleted.evidence, 1);

    // Protected cross-owner evidence remains present and non-404 while unrelated settled evidence is compacted (404).
    const stillPresent = await core
      .prepare("SELECT decision_id FROM core_evidence WHERE school_id=? AND decision_id='ev-cross-resolving'")
      .bind(SCHOOL)
      .first();
    assert.ok(stillPresent, "cross-owner resolving evidence preserved in core_evidence");
    const compactedRow = await core
      .prepare("SELECT decision_id FROM core_evidence WHERE school_id=? AND decision_id='ev-cross-settled'")
      .bind(SCHOOL)
      .first();
    assert.equal(compactedRow, null, "unrelated settled evidence was compacted");
    const recoveredSettled = await suite.request(
      admin,
      "core",
      "/admin/evidence?decisionId=ev-cross-settled",
    );
    assert.equal(recoveredSettled.status, 404, "compacted decision returns 404");
    const recoveredProtected = await suite.request(
      admin,
      "core",
      "/admin/evidence?decisionId=ev-cross-resolving",
    );
    assert.notEqual(
      recoveredProtected.status,
      404,
      "protected cross-owner decision evidence is still present after unrelated cleanup",
    );
  } finally {
    await suite.close();
  }
}

console.log(
  "PASS Core decision evidence & admission retention (dryRun, RETENTION_DELETE_ENABLED guard, cross-owner dependency protection, stale preview 409, compact audit, recovery preserved)",
);
